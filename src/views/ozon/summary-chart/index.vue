<template>
  <div class="p-2 app-container report-page">
    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">
              共 {{ months.length }} 个月 · {{ items.length }} 个货号 · 交货 {{ supplyTotalText }} 件 · 退货 {{ returnTotalText }} 件 · 订单净额 {{ accrualTotalText }} RUB
            </span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot"></i>数据更新中</span>
          </div>
          <div class="view-actions">
            <el-select v-model="month" placeholder="全部月份" class="month-select" aria-label="月份" @change="load">
              <el-option label="全部月份" value="" />
              <el-option v-for="item in monthOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <el-radio-group v-model="sortMode" size="small" aria-label="排序方式">
              <el-radio-button value="supply">按交货件数</el-radio-button>
              <el-radio-button value="return">按退货件数</el-radio-button>
              <el-radio-button value="amount">按订单金额</el-radio-button>
              <el-radio-button value="name">按品名</el-radio-button>
            </el-radio-group>
            <el-switch v-model="showImage" active-text="产品图片" />
            <el-button :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>
      <p class="description">
        把<b>交货、订单、退货</b>三个主题的汇总放在一起对比。上半部分<b>按月趋势</b>是一张双轴组合图：
        <b class="c-supply">交货件数</b>与<b class="c-return">退货件数</b>走左轴（单位：件），
        <b class="c-accrual">订单净额</b>走右轴（单位：RUB）；下半部分<b>按货号排行</b>把同一卖家货号的三个指标并排展示，同样是双轴。
        归月口径与各自的图表页一致：交货按明细「完成日期」、退货按「退货日期」、订单按「应计日期」；订单金额统一取「总计（RUB）净额」。
        「月份」筛选作用于按货号图与下钻明细，上面那张月趋势图始终展示全部月份；<b>点击任意柱子可展开对应来源的明细</b>。
        交货 / 退货为全量口径（不做状态过滤），订单为全部费用分组。
      </p>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />
      <el-empty v-else-if="!loading && !months.length && !items.length" description="没有符合条件的汇总记录" />
      <template v-else>
        <div class="section-title">按月趋势（交货件数 / 退货件数 / 订单净额）</div>
        <div v-show="months.length" class="chart-scroll">
          <div
            ref="monthChartElement"
            class="summary-month-chart"
            :style="{ height: monthChartHeight + 'px', minWidth: monthChartWidth + 'px' }"
            role="img"
            :aria-label="monthChartLabel"
          />
        </div>
        <el-empty v-if="!months.length && !loading" description="没有按月汇总记录" :image-size="72" />
        <template v-if="items.length">
          <div class="section-title">按货号排行（交货 / 退货 / 订单三指标并排）</div>
          <div class="chart-scroll">
            <div
              ref="chartElement"
              class="summary-chart"
              :style="{ height: chartHeight + 'px', minWidth: chartWidth + 'px' }"
              role="img"
              :aria-label="chartLabel"
            />
          </div>
        </template>
        <el-empty v-else-if="!loading" description="当前月份没有汇总记录" :image-size="72" />
      </template>
    </el-card>

    <el-dialog
      v-model="detailVisible"
      :title="detailTitle"
      width="94%"
      top="5vh"
      append-to-body
      class="detail-dialog"
    >
      <div class="detail-head">
        <img v-if="detailImage" class="detail-thumb" :src="detailImage" alt="货品图片" />
        <div class="detail-ident">
          <div class="detail-name">{{ detailName }}</div>
          <div class="detail-sub">
            <template v-if="detailProduct">卖家货号：{{ detailProduct.sku || '未标注货号' }}</template>
            <template v-else>月份：{{ detailMonth || '—' }}</template>
            <template v-if="detailKindLabel"> · 当前明细：{{ detailKindLabel }}</template>
          </div>
        </div>
        <div class="detail-stats">
          <span class="c-supply">交货 <b>{{ int(detailStat.supplyQty) }}</b> 件</span>
          <span class="c-return">退货 <b>{{ int(detailStat.returnQty) }}</b> 件</span>
          <span class="c-accrual">订单净额 <b>{{ money(detailStat.accrualAmountRub) }}</b> RUB</span>
          <span>明细 <b>{{ detailTotal }}</b> 行</span>
        </div>
      </div>
      <el-alert v-if="detailError" :title="detailError" type="error" show-icon :closable="false" class="notice" />
      <el-table
        v-loading="detailLoading"
        :data="detailPageRows"
        size="small"
        border
        height="460"
        :empty-text="detailLoading ? '明细加载中…' : '没有符合条件的明细'"
        @sort-change="onDetailSortChange"
      >
        <el-table-column type="index" label="#" width="56" align="center" :index="detailIndex" />
        <el-table-column
          v-for="col in activeColumns"
          :key="col.prop"
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :min-width="col.minWidth"
          :align="col.align || 'left'"
          sortable="custom"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span v-if="col.negative && Number(row[col.prop]) < 0" class="negative">{{ cellText(row, col) }}</span>
            <template v-else>{{ cellText(row, col) }}</template>
          </template>
        </el-table-column>
      </el-table>
      <div class="detail-foot">
        <span class="record-count">共 {{ detailTotal }} 行 · 每页 {{ DETAIL_PAGE_SIZE }} 行</span>
        <el-pagination
          v-model:current-page="detailPage"
          :page-size="DETAIL_PAGE_SIZE"
          :total="detailTotal"
          layout="prev, pager, next"
          size="small"
          background
          @current-change="onDetailPageChange"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="OzonSummaryChart">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import {
  listSummaryChart,
  listSupplyProductRows,
  listReturnsChartRows,
  listAccrualChartRows,
  scopeReportQuery
} from '@/api/ozon/report';
import type { OzonSummaryChartVO, OzonSummaryMonthVO, OzonSummaryProductVO, ReportQuery } from '@/api/ozon/report/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import { attachmentFiles } from '../components/attachmentFiles';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, LegendComponent, CanvasRenderer]);

/** 三个主题的固定配色：交货蓝、退货橙（沿用各自图表页），订单绿（汇总页专属）。 */
const SUPPLY_COLOR = '#409eff';
const RETURN_COLOR = '#e6a23c';
const ORDER_COLOR = '#67c23a';
/** 明细弹窗每页行数：订单明细走后端分页，交货 / 退货明细一次拉全后前端分页。 */
const DETAIL_PAGE_SIZE = 20;
/** 货号图每个货号占用的最小宽度（一个槽位要放三根柱子 + 图片 + 品名）。 */
const SLOT_WIDTH = 92;
/** 货号图 x 轴品名的折行字数。 */
const NAME_WRAP = 5;
/**
 * 「未标注货号」的哨兵值。
 * 订单侧 seller_sku 为空的行（平台级费用：广告点击、FBO 跨仓中转、仓储费、债权债务抵销等）下钻时，
 * 不能把空串直接当 sku 下发：若依 tansParams 对 `value === ''` 会整条跳过参数，空串进不了 URL，
 * 后端收到 null 就当成「不过滤」，会把整库明细都返回。约定用这个非空哨兵，由后端翻译回空串。
 */
const NO_SKU_TOKEN = '__NO_SKU__';

type SummaryKind = 'supply' | 'accrual' | 'returns';
type DetailRow = Record<string, any>;

interface DetailColumn {
  prop: string;
  label: string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  kind: 'number' | 'date' | 'text';
  negative?: boolean;
  format?: (row: DetailRow) => string;
}

/** 交货明细列，与「0.1.交货图表」的下钻列保持一致。 */
const SUPPLY_COLUMNS: DetailColumn[] = [
  { prop: 'applicationNo', label: '交货申请编号', width: 138, kind: 'number' },
  { prop: 'status', label: '状态', width: 88, kind: 'text' },
  { prop: 'deliveryType', label: '配送类型', width: 100, kind: 'text' },
  { prop: 'shipmentDate', label: '发运日期', width: 104, kind: 'date' },
  { prop: 'shipmentTime', label: '发运时间段', width: 112, kind: 'text' },
  { prop: 'completionDate', label: '完成日期', width: 104, kind: 'date' },
  { prop: 'deliveryId', label: '子交货ID', width: 116, kind: 'number' },
  { prop: 'itemCode', label: 'ItemCode', width: 112, kind: 'text' },
  { prop: 'sku', label: 'SKU', width: 130, kind: 'text' },
  { prop: 'quantity', label: '数量', width: 80, align: 'right', kind: 'number', format: row => int(row.quantity) },
  { prop: 'storageCluster', label: '存储集群', minWidth: 110, kind: 'text' },
  { prop: 'dispatchPoint', label: '发运点', minWidth: 100, kind: 'text' }
];

/** 订单费用明细列，与「1.1.订单图表」的下钻列保持一致。 */
const ACCRUAL_COLUMNS: DetailColumn[] = [
  { prop: 'accrualId', label: '应计费用编号', width: 150, kind: 'text' },
  { prop: 'accrualDate', label: '应计日期', width: 108, kind: 'date' },
  { prop: 'serviceGroup', label: '费用分组', width: 120, kind: 'text' },
  { prop: 'accrualType', label: '应计类型', width: 160, kind: 'text' },
  { prop: 'sellerSku', label: '卖家货号', width: 140, kind: 'text' },
  { prop: 'productName', label: '商品名称', minWidth: 180, kind: 'text' },
  { prop: 'quantity', label: '数量', width: 88, align: 'right', kind: 'number', format: row => dec(row.quantity, 0) },
  {
    prop: 'totalAmountRub',
    label: '总计（RUB）',
    width: 128,
    align: 'right',
    kind: 'number',
    negative: true,
    format: row => money(row.totalAmountRub)
  }
];

/** 退货明细列，与「2.1.退货图表」的下钻列保持一致。 */
const RETURNS_COLUMNS: DetailColumn[] = [
  { prop: 'shipmentNo', label: '货件编号', width: 150, kind: 'text' },
  { prop: 'shopIdLabel', label: '店铺', width: 90, kind: 'text' },
  { prop: 'returnStatus', label: '退货状态', width: 112, kind: 'text' },
  { prop: 'statusDate', label: '状态日期', width: 150, kind: 'date' },
  { prop: 'returnDate', label: '退货日期', width: 150, kind: 'date' },
  { prop: 'returnReason', label: '退货原因', minWidth: 150, kind: 'text' },
  { prop: 'returnQty', label: '数量', width: 70, align: 'right', kind: 'number', format: row => int(row.returnQty) },
  { prop: 'storageDays', label: '仓储天数', width: 90, align: 'right', kind: 'number', format: row => int(row.storageDays) },
  { prop: 'storageFeeRub', label: '仓储费(₽)', width: 100, align: 'right', kind: 'number', format: row => money(row.storageFeeRub) },
  { prop: 'disposalFeeRub', label: '销毁费(₽)', width: 100, align: 'right', kind: 'number', format: row => money(row.disposalFeeRub) },
  { prop: 'buyerComment', label: '买家评论', minWidth: 150, kind: 'text' }
];

const KIND_LABEL: Record<SummaryKind, string> = { supply: '交货明细', accrual: '订单费用明细', returns: '退货明细' };

const shopStore = useOzonShopStore();
const chartData = ref<OzonSummaryChartVO>();
const loading = ref(false);
const error = ref('');
const month = ref('');
const sortMode = ref<'supply' | 'return' | 'amount' | 'name'>('supply');
const showImage = ref(true);
const monthChartElement = ref<HTMLElement>();
const chartElement = ref<HTMLElement>();
let monthChart: echarts.ECharts | undefined;
let chart: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
let requestVersion = 0;
let disposed = false;
let active = true;

const detailVisible = ref(false);
const detailKind = ref<SummaryKind>('supply');
const detailProduct = ref<OzonSummaryProductVO>();
const detailMonth = ref('');
const detailRows = ref<DetailRow[]>([]);
const detailTotal = ref(0);
const detailStat = ref<{ supplyQty: number; returnQty: number; accrualAmountRub: number }>({
  supplyQty: 0,
  returnQty: 0,
  accrualAmountRub: 0
});
const detailLoading = ref(false);
const detailError = ref('');
const detailPage = ref(1);
const detailSortProp = ref('');
const detailSortOrder = ref<'ascending' | 'descending' | ''>('');
let detailVersion = 0;

const months = computed(() => chartData.value?.months ?? []);
const items = computed(() => chartData.value?.products ?? []);
/** 月份下拉选项：最新的月份排前面，方便选择。 */
const monthOptions = computed(() => months.value.map(item => item.month).slice().reverse());
const supplyTotal = computed(() => items.value.reduce((sum, item) => sum + supplyQty(item), 0));
const returnTotal = computed(() => items.value.reduce((sum, item) => sum + returnQty(item), 0));
const accrualTotal = computed(() => items.value.reduce((sum, item) => sum + accrualAmount(item), 0));
const supplyTotalText = computed(() => int(supplyTotal.value));
const returnTotalText = computed(() => int(returnTotal.value));
const accrualTotalText = computed(() => money(accrualTotal.value));

/** 货号槽位的横向顺序：默认沿用后端的交货件数倒序，可切换到退货 / 订单金额 / 品名。 */
const sorted = computed(() => {
  const rows = [...items.value];
  if (sortMode.value === 'return') rows.sort((a, b) => returnQty(b) - returnQty(a));
  else if (sortMode.value === 'amount') rows.sort((a, b) => accrualAmount(b) - accrualAmount(a));
  else if (sortMode.value === 'name') rows.sort((a, b) => productName(a).localeCompare(productName(b), 'zh-Hans-CN'));
  return rows;
});
const monthChartHeight = computed(() => 300);
const monthChartWidth = computed(() => Math.max(months.value.length * 78, 340));
const chartHeight = computed(() => 400);
const chartWidth = computed(() => sorted.value.length * SLOT_WIDTH);
const monthChartLabel = computed(
  () =>
    '各月份交货件数、退货件数、订单净额组合柱状图，共 ' + months.value.length + ' 个月，合计交货 ' +
    int(months.value.reduce((sum, item) => sum + monthSupplyQty(item), 0)) + ' 件、退货 ' +
    int(months.value.reduce((sum, item) => sum + monthReturnQty(item), 0)) + ' 件、订单净额 ' +
    money(months.value.reduce((sum, item) => sum + monthAccrualAmount(item), 0)) + ' 卢布'
);
const chartLabel = computed(
  () =>
    '各货号交货件数、退货件数、订单净额组合柱状图，共 ' + sorted.value.length + ' 个货号，合计交货 ' +
    supplyTotalText.value + ' 件、退货 ' + returnTotalText.value + ' 件、订单净额 ' + accrualTotalText.value + ' 卢布'
);

const detailName = computed(() =>
  detailMonth.value && !detailProduct.value ? detailMonth.value + ' 汇总明细' : detailProduct.value ? productName(detailProduct.value) : ''
);
const detailImage = computed(() => (detailProduct.value ? imageUrl(detailProduct.value) : ''));
const detailKindLabel = computed(() => KIND_LABEL[detailKind.value]);
const detailTitle = computed(() => detailKindLabel.value + ' · ' + detailName.value);
const activeColumns = computed<DetailColumn[]>(() =>
  detailKind.value === 'accrual' ? ACCRUAL_COLUMNS : detailKind.value === 'returns' ? RETURNS_COLUMNS : SUPPLY_COLUMNS
);

/**
 * 交货 / 退货明细一次拉全，排序与分页都在前端做；订单明细走后端分页，这里不再二次处理。
 */
const detailSortedRows = computed<DetailRow[]>(() => {
  if (detailKind.value === 'accrual' || !detailSortProp.value) return detailRows.value;
  const prop = detailSortProp.value;
  const kind = activeColumns.value.find(column => column.prop === prop)?.kind ?? 'text';
  const direction = detailSortOrder.value === 'descending' ? -1 : 1;
  return detailRows.value
    .map(row => ({ row, key: sortKey(row, prop, kind) }))
    .sort((left, right) => {
      if (left.key === null || right.key === null) {
        if (left.key === null && right.key === null) return 0;
        return left.key === null ? 1 : -1;
      }
      const diff =
        kind === 'text' ? String(left.key).localeCompare(String(right.key), 'zh-Hans-CN') : Number(left.key) - Number(right.key);
      return diff * direction;
    })
    .map(entry => entry.row);
});
const detailPageRows = computed<DetailRow[]>(() => {
  if (detailKind.value === 'accrual') return detailRows.value;
  const start = (detailPage.value - 1) * DETAIL_PAGE_SIZE;
  return detailSortedRows.value.slice(start, start + DETAIL_PAGE_SIZE);
});

function monthSupplyQty(item: OzonSummaryMonthVO) {
  return qty(item.supplyQty);
}
function monthReturnQty(item: OzonSummaryMonthVO) {
  return qty(item.returnQty);
}
function monthAccrualAmount(item: OzonSummaryMonthVO) {
  return Number.isFinite(Number(item.accrualAmountRub)) ? Number(item.accrualAmountRub) : 0;
}
function supplyQty(item: OzonSummaryProductVO) {
  return qty(item.supplyQty);
}
function returnQty(item: OzonSummaryProductVO) {
  return qty(item.returnQty);
}
function accrualAmount(item: OzonSummaryProductVO) {
  const value = Number(item.accrualAmountRub);
  return Number.isFinite(value) ? value : 0;
}
function qty(value: number | string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function productName(item: OzonSummaryProductVO) {
  return (item.productName || item.sku || '未标注货号').trim();
}
function productCode(item: OzonSummaryProductVO) {
  return (item.sku || '').trim();
}
/** 产品库「货品图片」的第一张图，与表格视图的附件口径一致。 */
function imageUrl(item: OzonSummaryProductVO) {
  return attachmentFiles(item.attachmentJson).find(file => file.image)?.cosUrl || '';
}
/** 数量展示：取整并加千分位。 */
function int(value: number | string | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Math.round(number).toLocaleString('zh-CN');
}
/** 数量展示：可按小数位取整。 */
function dec(value: number | string | null | undefined, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** 金额展示：带千分位，最多两位小数。 */
function money(value: number | string | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
/** 柱顶标签用的紧凑格式：金额过万折成「万」，避免长数字互相压字。 */
function compact(value: number, unit: 'qty' | 'rub') {
  if (unit === 'rub' && Math.abs(value) >= 10000) return (value / 10000).toFixed(1) + '万';
  return int(value);
}
/** x 轴标签按固定字数折行，避免相邻货号的品名互相压字。 */
function wrapName(name: string) {
  const chars = Array.from(name);
  if (chars.length <= NAME_WRAP) return name;
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += NAME_WRAP) lines.push(chars.slice(index, index + NAME_WRAP).join(''));
  return lines.join('\n');
}
function cellText(row: DetailRow, column: DetailColumn) {
  if (column.format) return column.format(row);
  const value = row[column.prop];
  return value === null || value === undefined || value === '' ? '—' : String(value);
}
function detailIndex(index: number) {
  return (detailPage.value - 1) * DETAIL_PAGE_SIZE + index + 1;
}
/** 排序键；返回 null 表示该行此列为空（排序时恒放最后）。日期兼容 DD.MM.YYYY 与 YYYY-MM-DD 两种文本。 */
function sortKey(row: DetailRow, prop: string, kind: 'number' | 'date' | 'text'): number | string | null {
  const text = String(row[prop] ?? '').trim();
  if (!text) return null;
  if (kind === 'date') {
    const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
    if (dmy) return Number(dmy[3] + dmy[2].padStart(2, '0') + dmy[1].padStart(2, '0'));
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (ymd) return Number(ymd[1] + ymd[2] + ymd[3]);
    return null;
  }
  if (kind === 'number') {
    const value = Number(text.replace(/,/g, ''));
    return Number.isFinite(value) ? value : text;
  }
  return text;
}
/** 明细表头排序：订单走后端排序并回到第 1 页，交货 / 退货排完整份数据后回到第 1 页。 */
function onDetailSortChange({ prop, order }: { prop: string; order: string | null }) {
  detailSortProp.value = order ? prop : '';
  detailSortOrder.value = order === 'ascending' ? 'ascending' : order === 'descending' ? 'descending' : '';
  detailPage.value = 1;
  if (detailKind.value === 'accrual') void loadDetail();
}
/** 翻页：只有订单明细需要重新请求后端，交货 / 退货是前端切片。 */
function onDetailPageChange() {
  if (detailKind.value === 'accrual') void loadDetail();
}

function monthTooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = months.value[point?.dataIndex ?? -1];
  if (!item) return '';
  return [
    item.month,
    '交货：' + int(monthSupplyQty(item)) + ' 件（' + Number(item.supplyOrders || 0) + ' 个申请）',
    '退货：' + int(monthReturnQty(item)) + ' 件（' + Number(item.returnShipments || 0) + ' 行货件）',
    '订单净额：' + money(monthAccrualAmount(item)) + ' RUB（' + Number(item.accrualCount || 0) + ' 个费用编号）',
    '点击柱子查看对应明细'
  ].join('\n');
}
function tooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = sorted.value[point?.dataIndex ?? -1];
  if (!item) return '';
  const code = productCode(item);
  return [
    productName(item) + (code ? '（' + code + '）' : ''),
    '交货：' + int(supplyQty(item)) + ' 件（' + Number(item.supplyOrders || 0) + ' 个申请）',
    '退货：' + int(returnQty(item)) + ' 件（' + Number(item.returnShipments || 0) + ' 行货件）',
    '订单净额：' + money(accrualAmount(item)) + ' RUB（' + Number(item.accrualCount || 0) + ' 个费用编号）',
    '点击柱子查看对应明细'
  ].join('\n');
}

async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = '';
  try {
    await shopStore.ensureLoaded().catch(() => {});
    // 不选月份时不下发 month，后端即不过滤（月趋势图本来就不受月份影响）。
    const query: ReportQuery = {};
    if (month.value) query.month = month.value;
    const result = await listSummaryChart(scopeReportQuery(query, shopStore.selectedId));
    if (version !== requestVersion || disposed) return;
    chartData.value = result.data;
    await renderCharts();
  } catch {
    if (version === requestVersion && !disposed) {
      error.value = '汇总数据查询失败，请点击刷新重试。';
      chartData.value = undefined;
    }
  } finally {
    if (version === requestVersion && !disposed) loading.value = false;
  }
}

function ensureMonthChart(): echarts.ECharts | undefined {
  if (!monthChartElement.value) return undefined;
  if (!monthChart) {
    monthChart = echarts.init(monthChartElement.value);
    monthChart.on('click', (params: CallbackDataParams) => {
      const item = months.value[params.dataIndex as number];
      if (item) void openDetail({ month: item.month, kind: kindOfSeries(params.seriesName), stat: monthStat(item) });
    });
  }
  return monthChart;
}
function ensureProductChart(): echarts.ECharts | undefined {
  if (!chartElement.value) return undefined;
  if (!chart) {
    chart = echarts.init(chartElement.value);
    chart.on('click', (params: CallbackDataParams) => {
      const item = sorted.value[params.dataIndex as number];
      if (item) void openDetail({ product: item, kind: kindOfSeries(params.seriesName), stat: productStat(item) });
    });
  }
  return chart;
}

/** 柱子名 → 明细来源。 */
function kindOfSeries(name?: string): SummaryKind {
  if (name === '退货件数') return 'returns';
  if (name === '订单净额') return 'accrual';
  return 'supply';
}
function monthStat(item: OzonSummaryMonthVO) {
  return { supplyQty: monthSupplyQty(item), returnQty: monthReturnQty(item), accrualAmountRub: monthAccrualAmount(item) };
}
function productStat(item: OzonSummaryProductVO) {
  return { supplyQty: supplyQty(item), returnQty: returnQty(item), accrualAmountRub: accrualAmount(item) };
}

async function renderCharts() {
  await nextTick();
  if (disposed || !active) return;
  renderMonthChart();
  renderProductChart();
  monthChart?.resize();
  chart?.resize();
}

/** 月度组合图：x=月份，左轴=件数（交货 / 退货），右轴=RUB（订单净额），柱子可点开当月明细。 */
function renderMonthChart() {
  const instance = ensureMonthChart();
  if (!instance || !months.value.length) return;
  const rows = months.value;
  instance.setOption(
    {
      aria: { enabled: true },
      animation: false,
      legend: { top: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText', confine: true, formatter: monthTooltip },
      grid: { top: 48, left: 8, right: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: rows.map(item => item.month),
        axisTick: { show: false },
        axisLabel: { interval: 0, margin: 8 }
      },
      yAxis: [
        {
          type: 'value',
          name: '件数',
          nameTextStyle: { fontSize: 12 },
          minInterval: 1,
          splitLine: { lineStyle: { type: 'dashed' } },
          axisLabel: { formatter: (value: number) => int(value) }
        },
        {
          type: 'value',
          name: '净额（RUB）',
          nameTextStyle: { fontSize: 12 },
          splitLine: { show: false },
          axisLabel: { formatter: (value: number) => compact(value, 'rub') }
        }
      ],
      series: [
        {
          name: '交货件数',
          type: 'bar',
          yAxisIndex: 0,
          data: rows.map(item => monthSupplyQty(item)),
          barMaxWidth: 20,
          cursor: 'pointer',
          itemStyle: { color: SUPPLY_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', distance: 3, fontSize: 10, formatter: (params: CallbackDataParams) => compact(Number(params.value), 'qty') }
        },
        {
          name: '退货件数',
          type: 'bar',
          yAxisIndex: 0,
          data: rows.map(item => monthReturnQty(item)),
          barMaxWidth: 20,
          cursor: 'pointer',
          itemStyle: { color: RETURN_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', distance: 3, fontSize: 10, formatter: (params: CallbackDataParams) => compact(Number(params.value), 'qty') }
        },
        {
          name: '订单净额',
          type: 'bar',
          yAxisIndex: 1,
          // 净额可能为负，负数柱子向下画，柱顶数字要落到柱子另一端。
          data: rows.map(item => ({ value: monthAccrualAmount(item), label: { position: monthAccrualAmount(item) < 0 ? 'bottom' : 'top' } })),
          barMaxWidth: 20,
          cursor: 'pointer',
          itemStyle: { color: ORDER_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, distance: 3, fontSize: 10, formatter: (params: CallbackDataParams) => compact(Number(params.value), 'rub') }
        }
      ]
    },
    { notMerge: true }
  );
}

/** 货号分组图：x=货品图片+品名，同一货号并排三根柱（双轴），柱子可点开该货号对应来源的明细。 */
function renderProductChart() {
  const instance = ensureProductChart();
  if (!instance || !sorted.value.length) return;
  const rows = sorted.value;
  const useImage = showImage.value;
  const images = rows.map(item => (useImage ? imageUrl(item) : ''));
  // 每个货号一个富文本样式，用 backgroundColor.image 把货品图片画在 x 轴标签里（图在上、品名在下）。
  const rich: Record<string, Record<string, unknown>> = { name: { fontSize: 10, lineHeight: 13, align: 'center' } };
  images.forEach((url, index) => {
    if (url) rich['p' + index] = { width: 20, height: 20, borderRadius: 3, align: 'center', backgroundColor: { image: url } };
  });
  instance.setOption(
    {
      aria: { enabled: true },
      animation: false,
      legend: { top: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText', confine: true, formatter: tooltip },
      grid: { top: 48, left: 8, right: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: rows.map(item => wrapName(productName(item))),
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          margin: 8,
          formatter: (value: string, index: number) => (images[index] ? '{p' + index + '|}\n' : '') + '{name|' + value + '}',
          rich
        }
      },
      yAxis: [
        {
          type: 'value',
          name: '件数',
          nameTextStyle: { fontSize: 12 },
          minInterval: 1,
          splitLine: { lineStyle: { type: 'dashed' } },
          axisLabel: { formatter: (value: number) => int(value) }
        },
        {
          type: 'value',
          name: '净额（RUB）',
          nameTextStyle: { fontSize: 12 },
          splitLine: { show: false },
          axisLabel: { formatter: (value: number) => compact(value, 'rub') }
        }
      ],
      series: [
        {
          name: '交货件数',
          type: 'bar',
          yAxisIndex: 0,
          data: rows.map(item => supplyQty(item)),
          barMaxWidth: 16,
          cursor: 'pointer',
          itemStyle: { color: SUPPLY_COLOR, borderRadius: [2, 2, 0, 0] }
        },
        {
          name: '退货件数',
          type: 'bar',
          yAxisIndex: 0,
          data: rows.map(item => returnQty(item)),
          barMaxWidth: 16,
          cursor: 'pointer',
          itemStyle: { color: RETURN_COLOR, borderRadius: [2, 2, 0, 0] }
        },
        {
          name: '订单净额',
          type: 'bar',
          yAxisIndex: 1,
          data: rows.map(item => accrualAmount(item)),
          barMaxWidth: 16,
          cursor: 'pointer',
          itemStyle: { color: ORDER_COLOR, borderRadius: [2, 2, 0, 0] }
        }
      ]
    },
    { notMerge: true }
  );
}

/** 打开明细弹窗：先定来源与口径，再拉第 1 页。 */
async function openDetail(options: { month?: string; product?: OzonSummaryProductVO; kind: SummaryKind; stat: { supplyQty: number; returnQty: number; accrualAmountRub: number } }) {
  detailKind.value = options.kind;
  detailProduct.value = options.product;
  detailMonth.value = options.month || '';
  detailStat.value = options.stat;
  detailVisible.value = true;
  detailPage.value = 1;
  detailSortProp.value = '';
  detailSortOrder.value = '';
  detailRows.value = [];
  detailTotal.value = 0;
  await loadDetail();
}

/** 拉取明细：交货 / 退货现有接口一次返回全部（前端分页），订单必须走后端分页。 */
async function loadDetail() {
  const version = ++detailVersion;
  detailLoading.value = true;
  detailError.value = '';
  try {
    // 明细必须沿用图表的筛选口径，否则行数与柱高对不上。
    const monthValue = detailMonth.value || month.value;
    const query: ReportQuery = {};
    if (monthValue) query.month = monthValue;
    if (detailKind.value === 'supply') {
      if (detailProduct.value?.sku) query.sku = detailProduct.value.sku;
      const result = await listSupplyProductRows(scopeReportQuery(query, shopStore.selectedId));
      if (version !== detailVersion || disposed) return;
      detailRows.value = (result.data ?? []) as unknown as DetailRow[];
      detailTotal.value = detailRows.value.length;
    } else if (detailKind.value === 'returns') {
      if (detailProduct.value?.sku) query.articleNo = detailProduct.value.sku;
      const result = await listReturnsChartRows(scopeReportQuery(query, shopStore.selectedId));
      if (version !== detailVersion || disposed) return;
      detailRows.value = (result.data ?? []) as unknown as DetailRow[];
      detailTotal.value = detailRows.value.length;
    } else {
      query.pageNum = detailPage.value;
      query.pageSize = DETAIL_PAGE_SIZE;
      // 图表里的「未标注货号」= seller_sku 为空，用哨兵值下发（空串会被 tansParams 丢弃）；不点货号柱时不下发。
      if (detailProduct.value) query.sku = detailProduct.value.sku || NO_SKU_TOKEN;
      if (detailSortProp.value) {
        query.orderByColumn = detailSortProp.value;
        query.isAsc = detailSortOrder.value === 'ascending' ? 'ascending' : 'descending';
      }
      const result = await listAccrualChartRows(scopeReportQuery(query, shopStore.selectedId));
      if (version !== detailVersion || disposed) return;
      detailRows.value = (result.data?.rows ?? []) as unknown as DetailRow[];
      detailTotal.value = Number(result.data?.total ?? 0);
    }
  } catch {
    if (version === detailVersion && !disposed) detailError.value = '汇总明细查询失败，请关闭弹窗后重试。';
  } finally {
    if (version === detailVersion && !disposed) detailLoading.value = false;
  }
}

watch([sortMode, showImage], () => void renderProductChart());
watch(() => shopStore.selectionKey, () => void load());
onMounted(() => {
  observer = new ResizeObserver(() => {
    if (active) {
      monthChart?.resize();
      chart?.resize();
    }
  });
  if (monthChartElement.value) observer.observe(monthChartElement.value);
  if (chartElement.value) observer.observe(chartElement.value);
  void load();
});
onActivated(() => {
  active = true;
  void renderCharts();
});
onDeactivated(() => {
  active = false;
  monthChart?.dispose();
  monthChart = undefined;
  chart?.dispose();
  chart = undefined;
});
onBeforeUnmount(() => {
  disposed = true;
  requestVersion++;
  detailVersion++;
  observer?.disconnect();
  monthChart?.dispose();
  monthChart = undefined;
  chart?.dispose();
  chart = undefined;
});
</script>

<style scoped>
.report-page { overflow: hidden; padding-top: 0; }
.report-card :deep(.el-card__header) { padding: 6px 12px; }
.report-card :deep(.el-card__body) { padding: 0 12px 10px; }
.table-toolbar, .view-controls, .view-actions { display: flex; align-items: center; gap: 8px; }
.table-toolbar { justify-content: space-between; flex-wrap: wrap; }
.view-controls { flex: 1 1 auto; min-width: 0; }
.view-actions { flex: none; margin-left: auto; flex-wrap: wrap; }
.view-actions :deep(.el-button + .el-button) { margin-left: 0; }
.month-select { width: 116px; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.description { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); margin: 8px 0 10px; }
.c-supply { color: #409eff; }
.c-return { color: #e6a23c; }
.c-accrual { color: #67c23a; }
.notice { margin-top: 12px; font-size: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); margin: 4px 0 8px; }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 20px; padding: 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-bg-color-overlay); color: var(--el-text-color-secondary); font-size: 12px; line-height: 1; white-space: nowrap; }
.view-refreshing-dot { display: inline-block; width: 9px; height: 9px; border: 1.5px solid var(--el-color-primary); border-top-color: transparent; border-radius: 50%; animation: view-refreshing-spin .7s linear infinite; }
@keyframes view-refreshing-spin { to { transform: rotate(360deg); } }
.chart-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
.summary-month-chart { width: 100%; }
.summary-chart { width: 100%; }
.detail-head { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; }
.detail-thumb { width: 48px; height: 48px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; object-fit: contain; flex: none; background: var(--el-fill-color-lighter); }
.detail-ident { min-width: 0; flex: 1 1 auto; }
.detail-name { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.detail-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats { display: flex; align-items: center; gap: 14px; flex: none; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats b { font-size: 14px; }
.detail-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
.negative { color: var(--el-color-danger); }
</style>
