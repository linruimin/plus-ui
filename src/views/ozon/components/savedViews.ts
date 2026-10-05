import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { readPreference, writePreference } from './preferences';

export interface ViewSnapshot {
  query?: Record<string, any>;
  columns?: unknown;
  dateRange?: string[];
  groups?: ViewOrder[];
  sorts?: ViewOrder[];
  /** 「本页合计」行每列的展示方式（列 prop → 'sum' 求和 / 'none' 不展示）。 */
  summary?: Record<string, 'sum' | 'none'>;
  /** 内置视图预设版本号；预设升级时用它把新列设置同步到已保存的快照。 */
  rev?: number;
}
export interface ViewOrder { field: string; desc: boolean }
export interface SavedView { id: string; name: string; snapshot: ViewSnapshot; notes?: string[] }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

/** 每个账号、页面、视图分别保存偏好；只存配置，不缓存业务记录。 */
export function useSavedViews(key: string, defaults: SavedView[], capture: () => ViewSnapshot, apply: (snapshot: ViewSnapshot) => void) {
  const saved = readPreference(key);
  const custom = ref<SavedView[]>(Array.isArray(saved.custom) ? saved.custom.filter((v: any) =>
    isObject(v) && typeof v.id === 'string' && v.id.startsWith('custom:') && v.id !== 'custom:legacy' && typeof v.name === 'string' &&
    v.name.trim().length > 0 && v.name.length <= 40 && isObject(v.snapshot)
  ).slice(0, 100) : []);
  const defaultIds = new Set(defaults.map(view => view.id));
  const hiddenDefaults = ref<string[]>(Array.isArray(saved.hiddenDefaults)
    ? [...new Set(saved.hiddenDefaults.filter((id: unknown): id is string => typeof id === 'string' && defaultIds.has(id)))]
    : []);
  const defaultNames = ref<Record<string, string>>(isObject(saved.defaultNames)
    ? Object.fromEntries(Object.entries(saved.defaultNames).filter(([id, name]) =>
      defaultIds.has(id) && typeof name === 'string' && name.trim().length > 0 && name.length <= 40))
    : {});
  const snapshots = ref<Record<string, ViewSnapshot>>(isObject(saved.snapshots) ? saved.snapshots : {});
  delete snapshots.value['custom:legacy'];
  // 内置视图预设升级（rev 变大）时，把新的列设置和筛选条件覆盖到本地已有快照，其余偏好保留。
  {
    let migrated = false;
    for (const view of defaults) {
      const rev = view.snapshot.rev;
      if (!rev) continue;
      const snap = snapshots.value[view.id];
      if (!isObject(snap) || snap.rev === rev) continue;
      if (view.snapshot.columns !== undefined) snap.columns = clone(view.snapshot.columns);
      const presetQuery = view.snapshot.query;
      if (isObject(presetQuery) && Array.isArray(presetQuery.conditions)) {
        // 筛选改为多维表格风格的条件列表，同时清掉旧的精确/包含/日期区间映射。
        snap.query = {
          ...(isObject(snap.query) ? snap.query : {}),
          conditions: clone(presetQuery.conditions),
          conjunction: presetQuery.conjunction === 'or' ? 'or' : 'and',
          filters: {},
          ends: {},
          equals: {}
        };
      }
      snap.rev = rev;
      migrated = true;
    }
    if (migrated) writePreference(key, { ...saved, snapshots: snapshots.value });
  }
  if (hiddenDefaults.value.length === defaults.length && !custom.value.length) hiddenDefaults.value = hiddenDefaults.value.filter(id => id !== defaults[0].id);
  const views = computed(() => [
    ...defaults.filter(view => !hiddenDefaults.value.includes(view.id)).map(view => ({ ...view, name: defaultNames.value[view.id] || view.name })),
    ...custom.value
  ]);
  const candidate = typeof saved.activeId === 'string' ? saved.activeId : custom.value[0]?.id;
  const activeId = ref(views.value.some(v => v.id === candidate) ? candidate! : views.value[0].id);
  const storageWarning = ref(false);
  let restoring = false;
  /**
   * 「表格里当前真正生效的是哪个视图的配置」—— 与 activeId（按钮选中态）分开记。
   * 切开视图时 activeId 会先变（为了按钮立刻变色），配置要等下一帧才应用；
   * 这中间的窗口里 `capture()` 拿到的仍是**上一个视图**的配置，
   * 若按 activeId 存就会把它写到刚点选的那个视图名下 → 污染视图快照（连点两个视图时必现）。
   */
  let restoredId = activeId.value;
  const activeView = computed(() => views.value.find(v => v.id === activeId.value)!);
  function persist() {
    if (!writePreference(key, { activeId: activeId.value, custom: custom.value, snapshots: snapshots.value, hiddenDefaults: hiddenDefaults.value, defaultNames: defaultNames.value })) storageWarning.value = true;
  }
  function saveCurrent() {
    if (restoring) return;
    snapshots.value[restoredId] = clone(capture()); persist();
  }
  function restore() {
    restoring = true;
    try { apply(clone(isObject(snapshots.value[activeId.value]) ? snapshots.value[activeId.value] : activeView.value.snapshot)); }
    finally { restoring = false; restoredId = activeId.value; }
  }
  /**
   * 只切换「选中态」—— 不碰表格配置，所以这一帧极其便宜，浏览器能立刻把按钮颜色画出来。
   * 与 applyActive() 拆开是为了「点一下马上有反馈」：否则 activeId 与 restore()（会改
   * groups/columns/rows → 整表重渲染 200~500ms）挤在同一帧，按钮变色要等重渲染做完才上屏。
   */
  function activate(id: string) {
    if (!views.value.some(v => v.id === id)) return false;
    activeId.value = id;
    return true;
  }
  /**
   * 把当前选中视图的配置应用到表格（会触发整表重渲染），调用方应排在下一帧（见 nextPaint）。
   * 先把上一个视图的配置存回它自己名下（此刻 capture() 拿到的还是它的配置），再 restore()。
   */
  function applyActive() { saveCurrent(); restore(); persist(); }
  function select(id: string) { if (activate(id)) applyActive(); }
  async function askName(title: string, initial = '') {
    try {
      const result = await ElMessageBox.prompt('名称最多 40 个字；视图保存到当前账号的本浏览器。', title, {
        inputValue: initial, confirmButtonText: '保存', cancelButtonText: '取消',
        inputValidator: (value: string) => {
          const name = (value || '').trim();
          return name.length > 0 && name.length <= 40 && !views.value.some(v => v.name === name && v.id !== (title === '重命名视图' ? activeId.value : '')) || '请输入不重复的名称（1–40 字）';
        }
      });
      return result.value.trim();
    } catch { return undefined; }
  }
  async function add() {
    if (custom.value.length >= 100) { ElMessage.warning('最多保存 100 个自建视图'); return false; }
    const name = await askName('新增视图'); if (!name) return false;
    saveCurrent();
    const id = 'custom:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 10);
    custom.value.push({ id, name, snapshot: clone(capture()) }); activeId.value = id; restoredId = id; saveCurrent(); return true;
  }
  async function rename() {
    const view = activeView.value;
    const name = await askName('重命名视图', view.name); if (!name) return false;
    const customView = custom.value.find(v => v.id === view.id);
    if (customView) customView.name = name;
    else defaultNames.value[view.id] = name;
    persist(); return true;
  }
  async function remove() {
    if (views.value.length <= 1) { ElMessage.warning('至少保留一个视图'); return false; }
    const id = activeId.value;
    const preset = defaultIds.has(id);
    try { await ElMessageBox.confirm(preset ? '仅从当前账号的本浏览器移除该内置视图，业务记录保持不变。' : '仅删除当前自建视图，业务记录保持不变。', '删除视图', { type: 'warning', confirmButtonText: '删除视图', cancelButtonText: '取消' }); } catch { return false; }
    if (preset) { hiddenDefaults.value = [...hiddenDefaults.value, id]; delete defaultNames.value[id]; }
    else custom.value = custom.value.filter(v => v.id !== id);
    delete snapshots.value[id];
    activeId.value = views.value[0].id; restore(); persist(); return true;
  }
  async function reset() {
    try { await ElMessageBox.confirm('恢复此视图创建时的筛选、分组、排序和列设置？', '恢复视图', { confirmButtonText: '恢复', cancelButtonText: '取消' }); } catch { return false; }
    delete snapshots.value[activeId.value]; restore(); persist(); return true;
  }
  restore();
  persist();
  watch(capture, saveCurrent, { deep: true, flush: 'sync' });
  return { views, activeId, activeView, storageWarning, select, activate, applyActive, add, rename, remove, reset, saveCurrent };
}
