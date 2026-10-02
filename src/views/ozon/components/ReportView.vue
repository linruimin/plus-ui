<template>
  <div class="p-2 app-container report-page">
    <el-card shadow="never" class="report-card">
      <template #header>
        <div ref="toolbarRef" class="table-toolbar">
          <div class="view-controls">
            <ViewSelector v-if="!trendOnly" :model-value="viewManager.activeId.value" :views="viewManager.views.value" @select="selectSavedView" @action="savedViewAction" />
            <el-radio-group v-if="kind === 'monthly'" v-model="query.groupBy" size="small" @change="changeView">
              <el-radio-button value="month">按月分组</el-radio-button>
              <el-radio-button value="sku">按卖家 SKU 分组</el-radio-button><el-radio-button value="none">不分组</el-radio-button>
            </el-radio-group>
            <el-radio-group v-if="kind === 'supply'" v-model="query.groupBy" size="small" @change="handleQuery"><el-radio-button value="sku">按货品分析</el-radio-button><el-radio-button value="none">不分组</el-radio-button></el-radio-group>
            <el-select v-if="(kind === 'monthly' || kind === 'supply') && query.groupBy !== 'none'" v-model="query.groupDesc" style="width:110px" aria-label="分组顺序" @change="handleQuery"><el-option :value="false" label="分组正序"/><el-option :value="true" label="分组倒序"/></el-select>
            <h2 v-if="trendOnly" class="trend-title">产品销售趋势</h2>
            <el-tag v-if="kind === 'accruals' && shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span v-if="accrualView !== 'chart'" class="record-count">共 {{ total.toLocaleString() }} 条</span>
          </div>
          <div class="view-actions">
            <ColumnSettings v-if="!trendOnly" v-model="columnState" :columns="allTableColumns" />
            <el-popover v-model:visible="filterOpen" trigger="click" placement="bottom-end" :width="panelWidth" :persistent="false">
              <template #reference><el-button icon="Filter" :type="hasFilters ? 'primary' : 'default'" plain @click="sortOpen = false">筛选</el-button></template>
              <div class="report-panel">
                <h3>{{ title }}</h3><p class="panel-description">{{ description }}</p>
                <el-form-item v-if="kind === 'supply'" label="申请状态"><el-select v-model="query.status" clearable placeholder="全部状态"><el-option label="已完成" value="已完成"/><el-option label="全部状态" value=""/></el-select></el-form-item>
      <el-form :model="query" label-position="top" class="panel-filters" @submit.prevent="applyFilters">
        <el-form-item v-if="kind === 'monthly'" label="统计月份">
          <el-date-picker v-model="query.reportMonth" type="month" value-format="YYYY-MM-01" placeholder="全部月份" clearable />
        </el-form-item>
        <template v-if="kind !== 'accruals'">
          <el-form-item :label="kind === 'supply' ? 'ItemCode' : '卖家SKU'"><el-input v-model="query.sellerSku" placeholder="精确匹配" maxlength="255" clearable @keyup.enter="handleQuery" /></el-form-item>
          <el-form-item label="Ozon SKU"><el-input v-model="query.ozonSku" placeholder="完整数字 SKU" maxlength="20" clearable @keyup.enter="handleQuery" /></el-form-item>
          <el-form-item label="商品名称"><el-input v-model="query.productName" placeholder="商品关键字" maxlength="200" clearable @keyup.enter="handleQuery" /></el-form-item>
        </template>
        <template v-if="kind === 'accruals'">
          <el-form-item label="应计费用编号"><el-input v-model="query.accrualId" maxlength="32" clearable @keyup.enter="handleQuery" /></el-form-item>
          <el-form-item label="最近应计日期"><el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" clearable /></el-form-item>
        </template>
        <el-form-item v-if="kind === 'supply'" label="申请编号"><el-input v-model="query.applicationNo" maxlength="64" clearable @keyup.enter="handleQuery" /></el-form-item>
        <el-form-item>
          <el-button v-hasPermi="['ozon:report:list']" type="primary" icon="Search" :loading="loading" @click="applyFilters">应用筛选</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>

      </el-form>
      <el-alert v-if="kind === 'accruals'" title="销售额为正金额合计，应计费用保留负号；总计＝销售额＋应计费用。总计-税后＝总计－销售额×0.075；总计-人民币＝总计-税后×0.075。两列计算金额显示2位小数，按未舍入值计算；空编号不展示。" type="info" :closable="false" class="notice" />
      <el-alert v-if="kind === 'monthly'" :title="query.groupBy === 'month' ? '同一月份归为一组，默认按最终到手（RUB）倒序。点击表头可切换组内排序。' : '同一卖家 SKU 归为一组，默认按统计月份倒序。点击表头可切换组内排序。'" type="info" :closable="false" class="notice" />
                <p v-if="kind === 'monthly'" class="panel-description">分组标题展示当前页记录，同一组跨页时继续展示。</p>
              </div>
            </el-popover>
            <el-popover v-if="accrualView !== 'chart'" v-model:visible="sortOpen" trigger="click" placement="bottom-end" :width="Math.min(360, panelWidth)" :persistent="false">
              <template #reference><el-button icon="Sort" @click="filterOpen = false">排序</el-button></template>
              <div class="report-panel">
                <h3>{{ kind === 'monthly' ? viewTitle + ' · 组内排序' : '排序' }}</h3>
                <p class="panel-description">选择字段和方向后自动生效，也可点击表头排序。</p>

          <div class="sort-controls">
            <span>{{ kind === 'monthly' ? '组内排序' : '排序' }}</span>
            <el-select v-model="query.orderByColumn" aria-label="排序字段" style="width: 190px" @change="handleQuery">
              <el-option v-for="column in columns.filter(c => !c.attachment)" :key="column.prop" :label="column.label" :value="column.prop" />
            </el-select>
            <el-select v-model="query.isAsc" aria-label="排序方向" style="width: 100px" @change="handleQuery"><el-option label="倒序" value="desc" /><el-option label="正序" value="asc" /></el-select>
            <el-button icon="Refresh" :loading="loading" @click="getList">刷新</el-button>
          </div>

              </div>
            </el-popover>
          </div>
        </div>
      </template>
      <el-alert v-if="storageWarning || viewManager.storageWarning.value" title="浏览器未允许保存设置，本次调整仍有效，但重新打开后可能无法恢复。" type="warning" :closable="false" />
      <SalesTrendChart v-if="kind === 'accruals' && accrualView === 'chart'" :query="trendQuery" :storage-key="basePreferenceKey + ':chart'" @detail="showDetail" />
      <div v-if="!trendOnly" ref="tableViewport" class="table-viewport">
      <el-table class="ozon-data-grid" :key="tableKey" v-loading="loading" :data="displayRows" border stripe :show-summary="rows.length>0" :summary-method="summaryMethod" :height="tableHeight" :row-key="rowKey" :row-class-name="rowClass" :default-sort="defaultSort" :empty-text="error ? '查询失败，请重试' : '没有符合条件的记录'" @sort-change="sortChange">
        <el-table-column prop="__rowNumber" label="#" width="56" fixed="left" align="center" class-name="row-number-column"><template #default="{row}"><span v-if="!row.__group">{{ rowNumbers.get(rowKey(row)) }}</span></template></el-table-column>
        <el-table-column v-for="column in tableColumns" :key="column.prop" :prop="column.prop" :label="column.label" :width="gridColumnWidth(column)" :fixed="column.fixed" :min-width="gridColumnWidth(column)" :sortable="column.attachment || column.prop === '__actions' ? false : 'custom'" :align="column.numeric ? 'right' : 'left'" show-overflow-tooltip>
          <template #default="{ row }"><span v-if="row.__group" class="group-cell" :title="row.__groupTitle||row.__group"><template v-if="column.prop===tableColumns[0]?.prop"><span class="group-name">{{ row.__groupName }}</span><span class="group-count">{{ row.__count }} 条</span></template><span v-if="row[column.prop]!==undefined" class="group-sum"><span class="sum-prefix">求和</span><span class="sum-value">{{ display(row[column.prop],column) }}</span></span></span><el-button v-else-if="column.prop === '__actions'" link type="primary" @click="showDetail(row)">详情</el-button><AttachmentImages v-else-if="column.attachment" :value="row[column.prop]"/><span v-else>{{ display(row[column.prop], column) }}</span></template>
        </el-table-column>

      </el-table>
      <div v-show="hasHorizontalScroll" ref="horizontalTrack" class="horizontal-track" aria-label="表格横向滚动条" @scroll="onTrackScroll"><div :style="{width:scrollContentWidth+'px',height:'1px'}"/></div>
        <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="table-error" />
      </div>
      <div v-if="!trendOnly" ref="footerRef" class="table-footer">
      <pagination :auto-scroll="false" v-model:page="query.pageNum" v-model:limit="query.pageSize" :page-sizes="[10, 20, 50, 100]" :total="total" @pagination="getList" />
      </div>
    </el-card>

    <el-dialog v-model="detailOpen" :title="kind === 'accruals' ? '费用编号 ' + (detail.accrualId || '') + ' · 全部明细' : title + ' · 详情'" width="min(1200px, 96vw)" top="6vh" append-to-body>
      <template v-if="kind === 'accruals'">
        <div class="line-settings"><ColumnSettings v-model="lineColumnState" :columns="reportColumns.accrualLines" /></div>
        <el-alert v-if="linesError" :title="linesError" type="error" :closable="false" />
        <el-table class="ozon-data-grid" :key="lineQuery.orderByColumn + ':' + lineQuery.isAsc + ':' + JSON.stringify(lineColumnState)" v-loading="linesLoading" :data="lines" border :height="Math.max(140, viewportHeight - 300)" :default-sort="{ prop: lineQuery.orderByColumn, order: lineQuery.isAsc === 'asc' ? 'ascending' : 'descending' }" @sort-change="lineSortChange">
          <el-table-column v-for="column in lineColumns" :key="column.prop" :prop="column.prop" :label="column.label" :width="gridColumnWidth(column)" :fixed="column.fixed" :min-width="gridColumnWidth(column)" :align="column.numeric ? 'right' : 'left'" sortable="custom" show-overflow-tooltip><template #default="{ row }">{{ display(row[column.prop], column) }}</template></el-table-column>
        </el-table>
        <pagination :auto-scroll="false" v-show="linesTotal > 0" v-model:page="lineQuery.pageNum" v-model:limit="lineQuery.pageSize" :page-sizes="[10, 20, 50, 100]" :total="linesTotal" @pagination="getLines" />
      </template>
      <el-descriptions v-else :column="1" border><el-descriptions-item v-for="column in columns" :key="column.prop" :label="column.label"><AttachmentImages v-if="column.attachment" :value="detail[column.prop]"/><span v-else>{{ display(detail[column.prop], column) }}</span></el-descriptions-item></el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onActivated, onBeforeUnmount, nextTick, reactive, ref, watch } from 'vue';
import { listReport, listAccrualLines, scopeReportQuery } from '@/api/ozon/report';
import type { ReportKind, ReportQuery, ReportRow } from '@/api/ozon/report/types';
import { useLoading } from '@/hooks/async/useLoading';
import { reportColumns, gridColumnWidth, canSumColumn, sumRowValues, formatNumericColumn } from './columns';
import type { ReportColumn } from './columns';
import SalesTrendChart from './SalesTrendChart.vue';
import AttachmentImages from './AttachmentImages.vue';
import ColumnSettings from './ColumnSettings.vue';
import { useUserStore } from '@/store/modules/user';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import ViewSelector from './ViewSelector.vue';
import { useSavedViews, type ViewSnapshot, type SavedView } from './savedViews';
import viewPresets from './viewPresets.json';
import { readPreference, writePreference, normalizeColumns, selectedColumns, normalizeQuery, normalizeDates } from './preferences';

const props = defineProps<{ kind: ReportKind; trendOnly?: boolean; preferenceKey?: string }>();
const kind = computed(() => props.kind);
const shopStore = useOzonShopStore();
const basePreferenceKey = 'ozon:views:v1:' + useUserStore().userId + ':' + (props.preferenceKey || (props.trendOnly ? 'trend' : props.kind));
const savedGroup = readPreference(basePreferenceKey).groupBy === 'sku' ? 'sku' : 'month';
const storageWarning = ref(false);
const titles = { monthly: '产品月报', accruals: '订单费用明细', supply: '交货申请明细' };
const title = computed(() => props.trendOnly ? '产品销售趋势' : titles[kind.value]);
const description = computed(() => kind.value === 'monthly' ? '按月份或卖家 SKU 查看产品收入与最终到手金额。' : kind.value === 'accruals' ? '按应计费用编号汇总正负金额，展开可查看全部原始记录。' : '按原视图筛选、分组查询交货商品记录。');
const columns = computed(() => reportColumns[kind.value]);
const query = reactive<ReportQuery>({ pageNum: 1, pageSize: 100, groupBy: savedGroup });
const dateRange = ref<string[]>([]);
const allTableColumns = computed<ReportColumn[]>(() => [...columns.value, { prop: '__actions', label: '操作', width: 87 }]);
const columnState = ref(normalizeColumns({}, allTableColumns.value));
const tableColumns = computed(() => selectedColumns(columnState.value, allTableColumns.value));
const preferenceKey = computed(() => basePreferenceKey + (kind.value === 'monthly' ? ':' + query.groupBy : ':table'));
const linePreferenceKey = basePreferenceKey + ':lines';
const lineColumnState = ref(normalizeColumns(readPreference(linePreferenceKey).columns, reportColumns.accrualLines));
const lineColumns = computed(() => selectedColumns(lineColumnState.value, reportColumns.accrualLines));
function saveLocal(key: string, patch: Record<string, unknown>) {
  if (!writePreference(key, { ...readPreference(key), ...patch })) storageWarning.value = true;
}

watch(lineColumnState, value => saveLocal(linePreferenceKey, { columns: value }), { deep: true, flush: 'sync' });
function restorePreferences() {
  const saved = readPreference(preferenceKey.value);
  const groupBy = query.groupBy;
  const groupDesc = query.groupDesc;
  for (const key of Object.keys(query)) Reflect.deleteProperty(query, key);
  Object.assign(query, { pageNum: 1, pageSize: 100, groupBy, groupDesc, ...(kind.value === 'supply' ? {status: '已完成'} : {}) });
  setDefaultSort();
  Object.assign(query, normalizeQuery(saved.query, columns.value, { ...query }));
  dateRange.value = normalizeDates(saved.dateRange);
  columnState.value = normalizeColumns(saved.columns, allTableColumns.value);
}
function saveView() { viewManager.saveCurrent(); }
const filterOpen = ref(false);
const sortOpen = ref(false);
const tableViewport = ref<HTMLElement>();
const horizontalTrack=ref<HTMLElement>(),scrollContentWidth=ref(0),hasHorizontalScroll=ref(false);
let bodyScroll:HTMLElement|undefined;let scrollObserver:ResizeObserver|undefined;
function syncTrack(){const view=bodyScroll?.querySelector('.el-scrollbar__view') as HTMLElement|null;const width=view?.scrollWidth||bodyScroll?.scrollWidth||0;scrollContentWidth.value=width;hasHorizontalScroll.value=width>(bodyScroll?.clientWidth||0)+1;if(horizontalTrack.value&&bodyScroll)horizontalTrack.value.scrollLeft=bodyScroll.scrollLeft;}
function onBodyScroll(){if(horizontalTrack.value&&bodyScroll)horizontalTrack.value.scrollLeft=bodyScroll.scrollLeft;}
function onTrackScroll(){if(bodyScroll&&horizontalTrack.value)bodyScroll.scrollLeft=horizontalTrack.value.scrollLeft;}
function bindHorizontalScroll(){void nextTick(()=>{const next=tableViewport.value?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap') as HTMLElement|undefined;if(bodyScroll===next){syncTrack();return;}bodyScroll?.removeEventListener('scroll',onBodyScroll);scrollObserver?.disconnect();bodyScroll=next;if(!next)return;next.addEventListener('scroll',onBodyScroll,{passive:true});scrollObserver=new ResizeObserver(syncTrack);scrollObserver.observe(next);const view=next.querySelector('.el-scrollbar__view');if(view)scrollObserver.observe(view);syncTrack();});}
const toolbarRef = ref<HTMLElement>();
const footerRef = ref<HTMLElement>();
const viewportHeight = ref(window.innerHeight);
const viewportWidth = ref(window.innerWidth);
const tableHeight = ref(360);
const panelWidth = computed(() => Math.min(440, viewportWidth.value - 24));
const hasFilters = computed(() => Boolean(query.sellerSku || query.ozonSku || query.productName || query.reportMonth || query.accrualId || query.applicationNo || dateRange.value?.length));
let layoutObserver: ResizeObserver | undefined;
let resizeFrame = 0;
function updateTableHeight() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    viewportHeight.value = window.innerHeight;
    viewportWidth.value = window.innerWidth;
    const top = tableViewport.value?.getBoundingClientRect().top;
    if (top !== undefined) {
      const footerHeight = footerRef.value?.getBoundingClientRect().height ?? 48;
      tableHeight.value = Math.max(100, Math.floor(window.innerHeight - top - footerHeight - 42));
    }
  });
}
function applyFilters() { filterOpen.value = false; handleQuery(); }
const accrualView = computed(() => props.trendOnly ? 'chart' : 'table');
const trendQuery = ref<ReportQuery>({ ...query });
const rows = ref<ReportRow[]>([]);
const total = ref(0);
const error = ref('');
const detailOpen = ref(false);
const detail = ref<ReportRow>({});
const { loading, setLoading } = useLoading();
let requestVersion = 0;
const viewTitle = computed(() => kind.value === 'monthly' ? (query.groupBy === 'none' ? '全部' : query.groupBy === 'month' ? '按月分组' : '按卖家 SKU 分组') : title.value);
const defaultSort = computed(() => ({ prop: query.orderByColumn, order: query.isAsc === 'asc' ? 'ascending' as const : 'descending' as const }));
const tableKey = computed(() => [kind.value, query.groupBy, query.orderByColumn, query.isAsc, query.groupDesc, JSON.stringify(columnState.value)].join(':'));
const summableColumns = computed(() => tableColumns.value.filter(canSumColumn));
const rowNumbers=computed(()=>new Map(rows.value.map((row,index)=>[rowKey(row),(query.pageNum-1)*query.pageSize+index+1])));
watch(tableKey,bindHorizontalScroll);watch(rows,bindHorizontalScroll);
const displayRows = computed<ReportRow[]>(() => {
  if (!rows.value.length) return [];
  const grouped = ['monthly', 'supply'].includes(kind.value) && query.groupBy !== 'none' && (kind.value !== 'supply' || query.groupBy === 'sku');
  const result: ReportRow[] = [];
  let previous = '';
  rows.value.forEach((row, index) => {
    if (grouped) {
      const group = query.groupBy === 'sku' ? String((kind.value === 'supply' ? row.sku : row.sellerSku) ?? '未填写SKU') : String(row.reportMonth ?? '').slice(0, 7);
      if (index === 0 || group !== previous) {
        let end = index + 1;
        while (end < rows.value.length && (query.groupBy === 'sku' ? String((kind.value === 'supply' ? rows.value[end].sku : rows.value[end].sellerSku) ?? '未填写SKU') : String(rows.value[end].reportMonth ?? '').slice(0, 7)) === group) end++;
        const label = group + ' · ' + (end - index) + '条';
        result.push({ ...sumRowValues(rows.value.slice(index, end), summableColumns.value), __key: 'group:' + index, __group: label, __groupName: group, __count: end - index, __groupTitle: (query.groupBy === 'sku' ? 'SKU：' : '统计月份：') + label });
        previous = group;
      }
    }
    result.push(row);
  });
  return result;
});
function summaryMethod({ columns }: { columns: Array<{ property?: string }> }): string[] {
  const sums = sumRowValues(rows.value, summableColumns.value);
  const first = tableColumns.value[0]?.prop;
  return columns.map(column => {
    if(column.property==='__rowNumber')return '';
    const field = tableColumns.value.find(item => item.prop === column.property);
    const value = field && Object.prototype.hasOwnProperty.call(sums, field.prop) ? '求和 ' + display(sums[field.prop], field) : '';
    return column.property === first ? '本页合计 · ' + rows.value.length + '条' + (value ? ' · ' + value : '') : value;
  });
}
function rowKey(row: ReportRow) { return String(row.__key ?? row.rowId ?? row.id); }
function rowClass({ row }: { row: ReportRow }) { return row.__group ? 'report-group-row' : ''; }
function display(value: ReportRow[string], column: ReportColumn) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.prop === 'reportMonth') return String(value).slice(0, 7);
  if (column.numeric || column.decimal) return formatNumericColumn(value, column);
  return String(value);
}
function setDefaultSort() {
  query.orderByColumn = kind.value === 'monthly' ? (query.groupBy === 'sku' ? 'reportMonth' : 'finalTakeHomeRub') : (kind.value === 'accruals' ? 'accrualDate' : 'completionDate');
  query.isAsc = 'desc';
}
async function getList() {
  saveView();
  const version = ++requestVersion;
  setLoading(true); error.value = '';
  try {
    // 订单费用明细跟随全局所选店铺；其余报表不含店铺维度。
    const params = scopeReportQuery(
      { ...query, startDate: dateRange.value?.[0], endDate: dateRange.value?.[1] },
      kind.value === 'accruals' ? shopStore.selectedId : undefined
    );
    if (kind.value === 'accruals' && accrualView.value === 'chart') {
      trendQuery.value = params;
      return;
    }
    const result = await listReport(kind.value, params);
    if (version !== requestVersion) return;
    rows.value = result.data?.rows ?? []; total.value = result.data?.total ?? 0;
  } catch {
    if (version !== requestVersion) return;
    rows.value = []; total.value = 0; error.value = '查询失败，请检查筛选条件后重试。';
  } finally { if (version === requestVersion) { setLoading(false); nextTick(updateTableHeight); } }
}
function handleQuery() { query.pageNum = 1; getList(); }
function changeView() { setDefaultSort(); handleQuery(); }
function resetQuery() {
  const groupBy = query.groupBy;
  const groupDesc = query.groupDesc;
  for (const key of Object.keys(query)) Reflect.deleteProperty(query, key);
  Object.assign(query, { pageNum: 1, pageSize: 100, groupBy, groupDesc, ...(kind.value === 'supply' ? {status: '已完成'} : {}) });
  dateRange.value = []; setDefaultSort(); getList();
}
function sortChange({ prop, order }: { prop: string; order: string | null }) {
  const direction = order === 'ascending' ? 'asc' : 'desc';
  if (order && query.orderByColumn === prop && query.isAsc === direction) return;
  if (!order) setDefaultSort();
  else { query.orderByColumn = prop; query.isAsc = direction; }
  handleQuery();
}

const lines = ref<ReportRow[]>([]);
const linesTotal = ref(0);
const linesLoading = ref(false);
const linesError = ref('');
const lineQuery = reactive<ReportQuery>(normalizeQuery(readPreference(linePreferenceKey).query, reportColumns.accrualLines, { pageNum: 1, pageSize: 100, orderByColumn: 'accrualDate', isAsc: 'desc' }));
let lineVersion = 0;
async function getLines() {
  saveLocal(linePreferenceKey, { query: { pageSize: lineQuery.pageSize, orderByColumn: lineQuery.orderByColumn, isAsc: lineQuery.isAsc } });
  const version = ++lineVersion;
  linesLoading.value = true; linesError.value = '';
  try {
    const result = await listAccrualLines(scopeReportQuery(lineQuery, shopStore.selectedId));
    if (version !== lineVersion) return;
    lines.value = result.data?.rows ?? []; linesTotal.value = result.data?.total ?? 0;
  } catch {
    if (version !== lineVersion) return;
    lines.value = []; linesTotal.value = 0; linesError.value = '明细查询失败，请重新打开后重试。';
  } finally { if (version === lineVersion) linesLoading.value = false; }
}
function lineSortChange({ prop, order }: { prop: string; order: string | null }) {
  lineQuery.orderByColumn = order ? prop : 'accrualDate';
  lineQuery.isAsc = order === 'ascending' ? 'asc' : 'desc';
  lineQuery.pageNum = 1; getLines();
}
function showDetail(row: ReportRow) {
  detail.value = row; detailOpen.value = true;
  if (kind.value === 'accruals') {
    Object.assign(lineQuery, { pageNum: 1, accrualId: row.accrualId, rowId: row.rowId });
    lines.value = []; linesTotal.value = 0; getLines();
  }
}
restorePreferences();
// 切换全局店铺后订单费用明细需要重新查询。
watch(() => shopStore.selectionKey, () => {
  if (kind.value !== 'accruals') return;
  requestVersion++;
  rows.value = []; total.value = 0; query.pageNum = 1;
  getList();
});
function captureSavedView(): ViewSnapshot { return { query: { ...query, pageNum: 1 }, columns: columnState.value, dateRange: dateRange.value ?? [] }; }
function applySavedView(snapshot: ViewSnapshot) {
  const saved = snapshot.query || {};
  for (const key of Object.keys(query)) Reflect.deleteProperty(query, key);
  Object.assign(query, { pageNum: 1, pageSize: 100,
    groupBy: ['month', 'sku', 'none'].includes(saved.groupBy) ? saved.groupBy : (kind.value === 'monthly' ? 'month' : 'none'),
    groupDesc: saved.groupDesc === true,
    ...(kind.value === 'supply' ? { status: '已完成' } : {}) });
  setDefaultSort();
  Object.assign(query, normalizeQuery(saved, columns.value, { ...query }));
  // 默认主键排序也由后端白名单支持，但不作为数据列展示。
  if (saved.orderByColumn === 'rowId' || saved.orderByColumn === 'id') query.orderByColumn = saved.orderByColumn;
  dateRange.value = normalizeDates(snapshot.dateRange);
  columnState.value = normalizeColumns(snapshot.columns, allTableColumns.value);
}
const viewDefaults = (viewPresets as Record<string, SavedView[]>)[kind.value];
const hasLegacy = Object.keys(readPreference(preferenceKey.value)).length > 0;
const viewManager = useSavedViews(basePreferenceKey + ':saved-views', viewDefaults, captureSavedView, applySavedView);
function selectSavedView(id: string) { viewManager.select(id); handleQuery(); nextTick(updateTableHeight); }
async function savedViewAction(action: 'add' | 'rename' | 'remove' | 'reset') { if (await viewManager[action]()) { handleQuery(); nextTick(updateTableHeight); } }
trendQuery.value = { ...query, startDate: dateRange.value?.[0], endDate: dateRange.value?.[1] };
onMounted(async () => {
  await nextTick();
  if (kind.value === 'accruals') void shopStore.loadShops().catch(() => {});
  layoutObserver = new ResizeObserver(updateTableHeight);
  if (toolbarRef.value) layoutObserver.observe(toolbarRef.value);
  if (footerRef.value) layoutObserver.observe(footerRef.value);
  window.addEventListener('resize', updateTableHeight);
  updateTableHeight();
  bindHorizontalScroll();
  getList();
});
onActivated(() => { nextTick(updateTableHeight); });
onBeforeUnmount(() => {
  layoutObserver?.disconnect();
  bodyScroll?.removeEventListener('scroll',onBodyScroll);scrollObserver?.disconnect();
  window.removeEventListener('resize', updateTableHeight);
  cancelAnimationFrame(resizeFrame);
});
</script>

<style scoped>
/* 分组和本页合计保留各列，数值对齐到原列。 */
.group-cell { display: inline-flex; align-items: baseline; gap: 8px; white-space: nowrap; }.group-name { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }.group-count { font-size: 12px; font-weight: 400; color: var(--el-text-color-secondary); }.group-sum { display: inline-flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }.sum-prefix { font-size: 12px; font-weight: 400; color: var(--el-text-color-secondary); }.sum-value { font-size: 13px; font-weight: 400; color: var(--el-text-color-primary); }

.report-page { overflow: hidden; padding-top: 0; }
.line-settings { display: flex; justify-content: flex-end; margin-bottom: 10px; }
.trend-title { margin: 0; font-size: 18px; font-weight: 600; }
.report-card :deep(.el-card__header) { padding: 6px 12px; }
.report-card :deep(.el-card__body) { padding: 0 12px 10px; }
.table-toolbar, .view-controls, .view-actions { display: flex; align-items: center; gap: 8px; }
.table-toolbar { justify-content: space-between; flex-wrap: nowrap; overflow-x: auto; }
.view-controls { flex: 1 1 auto; min-width: 0; }
.view-controls :deep(.saved-views) { flex: 1 1 auto; }
.view-actions { flex: none; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.view-actions { margin-left: auto; }
.view-actions :deep(.el-button + .el-button) { margin-left: 0; }
.table-viewport { position: relative; }
.table-error { position: absolute; top: 0; left: 0; width: 100%; z-index: 5; }
.table-footer :deep(.pagination-container) { margin-top: 0; padding-top: 4px; min-height: 34px; }
.report-panel { max-height: min(70vh, 650px); overflow-y: auto; }
.report-panel h3 { margin: 0 0 10px; font-size: 15px; }
.panel-description { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; margin: 8px 0 14px; }
.panel-filters :deep(.el-form-item) { margin-bottom: 12px; }
.panel-filters :deep(.el-input), .panel-filters :deep(.el-date-editor) { width: 100%; }
.sort-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.notice { margin-top: 12px; font-size: 12px; }
:global(.ozon-data-grid){--ozon-grid-text:#1f2329;--ozon-grid-heading:#1f2329;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Tahoma,'PingFang SC','Microsoft YaHei',Arial,'Hiragino Sans GB',sans-serif;font-size:14px;font-weight:400;line-height:20px;color:var(--ozon-grid-text);--el-table-text-color:var(--ozon-grid-text);--el-table-header-text-color:var(--ozon-grid-heading)}
:global(html.dark .ozon-data-grid){--ozon-grid-text:var(--el-text-color-primary);--ozon-grid-heading:var(--el-text-color-primary)}
:global(.ozon-data-grid th.el-table__cell){height:36px;padding:2px 0;font-size:13px;font-weight:600;color:var(--ozon-grid-heading)}
:global(.ozon-data-grid td.el-table__cell){height:34px;padding:2px 0}
:global(.ozon-data-grid .attachment-images){min-height:28px;padding:0;flex-wrap:nowrap;overflow:hidden}
:global(.ozon-data-grid .attachment-thumbnail){width:28px;height:28px;flex-basis:28px}
:global(.ozon-data-grid .cell){padding:0 10px;line-height:20px;font-variant-numeric:tabular-nums}
:global(.ozon-data-grid th .cell){white-space:nowrap;overflow:hidden;text-overflow:clip;line-height:20px;max-height:20px}
.report-page :deep(.ozon-data-grid .el-table__footer-wrapper td.el-table__cell) { background: var(--el-fill-color-light); height:34px; padding:2px 0; font-size:14px; font-weight:400; color: var(--el-text-color-primary); }
.report-page :deep(.ozon-data-grid .el-table__footer-wrapper td.el-table__cell:nth-child(2)) { font-weight: 400; }
.horizontal-track{height:16px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.report-page :deep(.ozon-data-grid .el-scrollbar__bar.is-horizontal){display:none}.report-page :deep(.ozon-data-grid .row-number-column){color:var(--el-text-color-secondary);font-size:12px}
:global(.ozon-data-grid .caret-wrapper){display:none}
:deep(.report-group-row td.el-table__cell) { background: var(--el-fill-color-light) !important; }
:global(.ozon-data-grid .el-button){font-family:inherit}
@media (max-width: 600px) { .table-footer { overflow-x: auto; } .view-controls { flex-wrap: wrap; } }
</style>
