/**
 * 视图数据缓存（多维表格口径）：切换视图时先把**上一次该视图**的数据铺上，再去后台刷新；
 * 刷新回来如果数据没变，就原样复用数组 —— el-table 不会重建 DOM。
 *
 * 只放内存、不落 localStorage：缓存的是「业务记录」，不是配置。
 * 配置（筛选 / 列 / 分组 / 排序）仍由 savedViews 单独持久化，两者互不影响。
 * 只缓存**第一页**：切视图时 restoreView 会把 pageNum 重置为 1，缓存与之一致才不会串页。
 */
export interface ViewDataSnapshot<T = Record<string, any>> {
  rows: T[];
  total: number;
}

/** 上限按「表 × 视图 × 店铺」条目数算，超了淘汰最久未用的。 */
const MAX_ENTRIES = 40;
const cache = new Map<string, ViewDataSnapshot>();

/** 读取并把条目移到队尾（LRU）。 */
export function readViewData<T>(key: string): ViewDataSnapshot<T> | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit as ViewDataSnapshot<T>;
}

export function writeViewData<T>(key: string, snapshot: ViewDataSnapshot<T>): void {
  cache.set(key, snapshot as ViewDataSnapshot);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 按前缀清缓存（例如某张表的数据被整体改写、或店铺切换后不再信任旧记录）。 */
export function dropViewData(prefix: string): void {
  for (const key of Array.from(cache.keys())) if (key.startsWith(prefix)) cache.delete(key);
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

