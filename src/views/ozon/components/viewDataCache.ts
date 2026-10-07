/**
 * 视图数据缓存（多维表格口径）：切换视图时先把**上一次该视图**的数据铺上，再去后台刷新；
 * 刷新回来如果数据没变，就原样复用数组 —— el-table 不会重建 DOM。
 *
 * 两级存储（2026-10-07 起）：
 * - **内存** LRU：同一次会话里切来切去最快，命中即用、同步返回。
 * - **localStorage**：关掉浏览器重新打开也还在 —— 这正是多维表格的行为：重开后点开看过的
 *   视图，立刻能看到上次那份数据（工具条上「数据更新中」小框提示正在刷新），不必先白等接口。
 *   超过 {@link TTL_MS} 的条目按过期处理，直接丢弃。
 *
 * 缓存的是「业务记录」，不是配置（筛选/列/分组/排序仍由 `savedViews` 单独持久化）。
 * key 由调用方拼、**必须带账号 id**，否则同一浏览器换账号会互相看到对方的记录。
 * 只缓存**第一页**：切视图会把 pageNum 重置为 1，缓存与之一致才不会串页。
 *
 * ⚠️ 记录是明文存在浏览器里的。换账号读不到（key 带账号 id），但旧数据仍留在磁盘上，
 * 共用电脑时别人能在开发者工具里看到 —— 需要的话可以在退出登录时调用 `dropViewData('')` 清空。
 */
export interface ViewDataSnapshot<T = Record<string, any>> {
  rows: T[];
  total: number;
}

/** 落盘时多存一个写入时间，用于过期判断与 LRU 淘汰。 */
interface StoredSnapshot<T = Record<string, any>> extends ViewDataSnapshot<T> {
  savedAt: number;
}

/** 内部统一前缀：所有缓存条目都挂在它下面，便于整体统计与清理。 */
const PREFIX = 'ozon:view-data:v1:';
/** 索引键：只存 `{ 完整key → { savedAt, size } }`，这样淘汰时不用把每条几百 KB 的数据 parse 一遍。 */
const INDEX_KEY = PREFIX + '__index';

const MEMORY_MAX = 40; // 内存条目上限
const STORED_MAX_ENTRIES = 16; // 磁盘条目上限
const STORED_MAX_CHARS = 1_800_000; // 磁盘总量上限（字符数；Chrome 每域配额约 5M 字符）
const TTL_MS = 24 * 60 * 60 * 1000; // 超过 24 小时的缓存当作过期

/** 一级：内存 LRU（Map 的迭代顺序即插入顺序）。 */
const memory = new Map<string, ViewDataSnapshot>();

/** localStorage 在隐私模式 / 被策略禁用时会直接抛异常，启动时探一次并降级为纯内存。 */
const canPersist = (() => {
  try {
    const probe = PREFIX + '__probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

type IndexMap = Record<string, { savedAt: number; size: number }>;

function readIndex(): IndexMap {
  try {
    const value = JSON.parse(localStorage.getItem(INDEX_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as IndexMap) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: IndexMap): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* 索引写不进去不影响主流程 */
  }
}

/** 读磁盘：顺带做结构校验与过期清理，坏数据不会污染界面。 */
function readStored<T>(fullKey: string): ViewDataSnapshot<T> | undefined {
  if (!canPersist) return undefined;
  try {
    const raw = localStorage.getItem(fullKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredSnapshot<T>;
    const valid = parsed && Array.isArray(parsed.rows) && typeof parsed.total === 'number' && typeof parsed.savedAt === 'number';
    if (!valid || Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(fullKey);
      const index = readIndex();
      if (index[fullKey]) {
        delete index[fullKey];
        writeIndex(index);
      }
      return undefined;
    }
    return { rows: parsed.rows, total: parsed.total };
  } catch {
    return undefined;
  }
}

/** 清掉过期条目，再按「旧 → 新」淘汰，直到条目数与总量都回到上限内。 */
function pruneStored(): void {
  if (!canPersist) return;
  const index = readIndex();
  const now = Date.now();
  const alive: [string, { savedAt: number; size: number }][] = [];
  let total = 0;
  for (const [full, meta] of Object.entries(index)) {
    if (!meta || typeof meta.savedAt !== 'number' || now - meta.savedAt > TTL_MS) {
      try {
        localStorage.removeItem(full);
      } catch {
        /* ignore */
      }
      continue;
    }
    total += meta.size || 0;
    alive.push([full, meta]);
  }
  alive.sort((a, b) => a[1].savedAt - b[1].savedAt); // 最旧的在前面
  let removed = 0;
  while ((alive.length - removed > STORED_MAX_ENTRIES || total > STORED_MAX_CHARS) && removed < alive.length) {
    const [full, meta] = alive[removed++];
    try {
      localStorage.removeItem(full);
    } catch {
      /* ignore */
    }
    total -= meta.size || 0;
  }
  const next: IndexMap = {};
  for (const [full, meta] of alive.slice(removed)) next[full] = meta;
  writeIndex(next);
}

/** 真正落盘（由 scheduleFlush 延迟调用）。 */
function persistStored(fullKey: string, snapshot: ViewDataSnapshot): void {
  if (!canPersist) return;
  let text = '';
  try {
    text = JSON.stringify({ rows: snapshot.rows, total: snapshot.total, savedAt: Date.now() } satisfies StoredSnapshot);
  } catch {
    return; // 循环引用等序列化失败：放弃持久化，内存里还有一份
  }
  try {
    localStorage.setItem(fullKey, text);
  } catch {
    // 配额满：先淘汰一批再试，仍失败就放弃（内存缓存照常可用）。
    pruneStored();
    try {
      localStorage.setItem(fullKey, text);
    } catch {
      return;
    }
  }
  const index = readIndex();
  index[fullKey] = { savedAt: Date.now(), size: text.length };
  writeIndex(index);
  pruneStored();
}

/**
 * 落盘安排在浏览器空闲时做：一次写 100~300KB 是同步 IO，压在切视图那一帧上会掉帧。
 * 同一个 key 的多次写入会合并（后写的覆盖先写的）。
 */
const pendingWrites = new Map<string, ViewDataSnapshot>();
let flushScheduled = false;

function scheduleFlush(): void {
  if (!canPersist || flushScheduled) return;
  flushScheduled = true;
  const run = (): void => {
    flushScheduled = false;
    const batch = Array.from(pendingWrites.entries());
    pendingWrites.clear();
    for (const [full, snapshot] of batch) persistStored(full, snapshot);
  };
  const idle = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (typeof idle === 'function') idle(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

function rememberMemory(key: string, snapshot: ViewDataSnapshot): void {
  memory.delete(key);
  memory.set(key, snapshot);
  while (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/** 读缓存：先内存，再磁盘（磁盘命中会回填内存）。命中失败才需要「清空表格去等接口」。 */
export function readViewData<T>(key: string): ViewDataSnapshot<T> | undefined {
  const hit = memory.get(key);
  if (hit) {
    rememberMemory(key, hit);
    return hit as ViewDataSnapshot<T>;
  }
  const stored = readStored<T>(PREFIX + key);
  if (stored) rememberMemory(key, stored);
  return stored;
}

export function writeViewData<T>(key: string, snapshot: ViewDataSnapshot<T>): void {
  rememberMemory(key, snapshot as ViewDataSnapshot);
  if (!canPersist) return;
  pendingWrites.set(PREFIX + key, snapshot as ViewDataSnapshot);
  scheduleFlush();
}

/**
 * 按前缀清缓存（某张表的数据被整体改写、店铺切换后不再信任旧记录、退出登录时清空）。
 * 传空字符串表示清掉全部。
 */
export function dropViewData(prefix: string): void {
  for (const key of Array.from(memory.keys())) if (key.startsWith(prefix)) memory.delete(key);
  for (const full of Array.from(pendingWrites.keys())) {
    if (full.slice(PREFIX.length).startsWith(prefix)) pendingWrites.delete(full);
  }
  if (!canPersist) return;
  const index = readIndex();
  let changed = false;
  for (const full of Object.keys(index)) {
    if (!full.slice(PREFIX.length).startsWith(prefix)) continue;
    try {
      localStorage.removeItem(full);
    } catch {
      /* ignore */
    }
    delete index[full];
    changed = true;
  }
  if (changed) writeIndex(index);
}

/**
 * 逐字段比较两页数据是否一致，用来判断后台刷新回来的结果有没有变化。
 * 没变就复用原数组：91 行 × 44 列重建一次 DOM 约 700ms 卡顿，能省则省。
 * 嵌套值（附件 JSON、引用列数组等）退化为 JSON 字符串比较。
 */
export function sameRows(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) {
    const left = a[index] as Record<string, unknown> | null | undefined;
    const right = b[index] as Record<string, unknown> | null | undefined;
    if (left === right) continue;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    for (const key of keys) {
      const lv = left[key];
      const rv = right[key];
      if (lv === rv) continue;
      if (lv && rv && typeof lv === 'object' && typeof rv === 'object') {
        if (JSON.stringify(lv) !== JSON.stringify(rv)) return false;
        continue;
      }
      return false;
    }
  }
  return true;
}

/**
 * 内容比较：给「每次取数都会拿到的新数组/新对象」用 —— 内容没变就别塞进响应式状态。
 *
 * ⚠️ 这个看起来多余的判断其实很值钱：表格的 `displayRows` / `visibleColumns` 都挂在
 * `rows` / `groups` / `customFields` / `removedFields` 上，只要换成一个「内容相同的新数组」，
 * 下游 computed 就会全部重算并且 el-table 会整表重渲染（实测 ≈0.5ms/单元格，
 * 91 行 × 31 列要 1.3 秒）。保持旧引用 = 整表零重渲染。
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
