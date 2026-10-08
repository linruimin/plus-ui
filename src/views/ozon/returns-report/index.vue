<template>
  <div class="p-2 app-container report-page">
    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">共 {{ months.length }} 个月 · {{ products.length }} 个产品 · 退货 {{ totalQuantityText }} 件</span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot"></i>数据更新中</span>
          </div>
          <div class="view-actions">
            <el-select v-model="status" placeholder="全部状态" class="status-select" aria-label="退货状态" @change="load">
              <el-option label="全部状态" value="" />
              <el-option v-for="option in STATUS_OPTIONS" :key="option" :label="option" :value="option" />
            </el-select>
            <el-select v-model="month" placeholder="全部月份" class="month-select" aria-label="退货月份" @change="load">
              <el-option label="全部月份" value="" />
              <el-option v-for="item in monthOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <el-radio-group v-model="sortMode" size="small" aria-label="排序方式">
              <el-radio-button value="quantity">按退货件数</el-radio-button>
              <el-radio-button value="name">按品名</el-radio-button>
            </el-radio-group>
            <el-switch v-model="showImage" active-text="产品图片" />
            <el-button :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>
      <p class="description">
        上图按退货月份汇总退货件数，下图按产品（按「卖家货号」归并）汇总，柱高 = 退货件数、柱顶数字为件数；
        产品图 x 轴标签是货品图片与品名（图片取自产品库「货品图片」，未维护图片的产品只显示品名）。
        「退货状态 / 月份」筛选同时作用于两个图与下钻明细；鼠标悬停可看货号与货件行数，<b>点击柱子可展开对应的退货明细</b>。
      </p>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />
      <el-empty v-else-if="!loading && !months.length" description="没有符合条件的退货记录" />
      <template v-else>
        <div class="section-title">按月趋势</div>
        <div v-show="months.length" class="chart-scroll">
          <div
            ref="monthChartElement"
            class="returns-month-chart"
            :style="{ height: monthChartHeight + 'px', minWidth: monthChartWidth + 'px' }"
            role="img"
            :aria-label="monthChartLabel"
          />
        </div>
        <template v-if="products.length">
          <div class="section-title">按产品排行</div>
          <div class="chart-scroll">
            <div
              ref="productChartElement"
              class="returns-chart"
              :style="{ height: chartHeight + 'px', minWidth: chartWidth + 'px' }"
              role="img"
              :aria-label="chartLabel"
            />
          </div>
        </template>
        <el-empty v-else-if="!loading" description="当前月份没有退货记录" :image-size="72" />
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
            卖家货号：{{ detailArticleNo || '—' }} · SKU：{{ detailSku || '—' }}
            <template v-if="detailMonth"> · 月份：{{ detailMonth }}</template>
            <template v-if="status"> · 状态：{{ status }}</template>
          </div>
        </div>
        <div class="detail-stats">
          <span>退货 <b>{{ amount(detailTotal) }}</b> 件</span>
          <span>明细 <b>{{ detailRows.length }}</b> 行</span>
          <span>仓储费 <b>{{ money(detailStorageFee) }}</b> ₽</span>
        </div>
      </div>
      <el-alert v-if="detailError" :title="detailError" type="error" show-icon :closable="false" class="notice" />
      <el-table
        v-loading="detailLoading"
        :data="detailPageRows"
        size="small"
        border
        height="460"
        :empty-text="detailLoading ? '明细加载中…' : '没有符合条件的退货明细'"
        @sort-change="onDetailSortChange"
      >
        <el-table-column type="index" label="#" width="46" align="center" :index="detailIndex" />
        <el-table-column prop="shipmentNo" label="货件编号" width="150" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="shopIdLabel" label="店铺" width="90" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="returnStatus" label="退货状态" width="112" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="statusDate" label="状态日期" width="150" sortable="custom" />
        <el-table-column prop="returnDate" label="退货日期" width="150" sortable="custom" />
        <el-table-column prop="returnReason" label="退货原因" min-width="150" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="returnQty" label="数量" width="70" align="right" sortable="custom">
          <template #default="{ row }">{{ amount(Number(row.returnQty) || 0) }}</template>
        </el-table-column>
        <el-table-column prop="storageDays" label="仓储天数" width="90" align="right" sortable="custom" />
        <el-table-column prop="storageFeeRub" label="仓储费(₽)" width="100" align="right" sortable="custom">
          <template #default="{ row }">{{ money(row.storageFeeRub) }}</template>
        </el-table-column>
        <el-table-column prop="disposalFeeRub" label="销毁费(₽)" width="100" align="right" sortable="custom">
          <template #default="{ row }">{{ money(row.disposalFeeRub) }}</template>
        </el-table-column>
        <el-table-column prop="buyerComment" label="买家评论" min-width="150" sortable="custom" show-overflow-tooltip />
      </el-table>
      <div class="detail-foot">
        <span class="record-count">
          本页 {{ amount(detailPageTotal) }} 件 · 合计 {{ amount(detailTotal) }} 件
        </span>
        <el-pagination
          v-model:current-page="detailPage"
          :page-size="DETAIL_PAGE_SIZE"
          :total="detailRows.length"
          layout="prev, pager, next"
          size="small"
          background
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="OzonReturnsReport">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { listReturnsChart, listReturnsChartRows, scopeReportQuery } from '@/api/ozon/report';
import type { OzonReturnsChartVO, OzonReturnsMonthVO, OzonReturnsRowVO, OzonReturnsStatsVO, ReportQuery } from '@/api/ozon/report/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import { attachmentFiles } from '../components/attachmentFiles';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

/** 退货状态取值，与「2.退货」明细页的筛选口径一致。 */
const STATUS_OPTIONS = ['被处理', '在 Ozon 仓库里', '销毁中', '正在寻找商品', '正在运往Ozon仓库', '我们已核销商品', '正在运送给您', '等待发货'];
/** 明细表的排序口径：数字列按数值；日期列库内是 "YYYY-MM-DD HH:mm:ss" 文本，直接按文本比较即时间序。 */
const DETAIL_SORT_KIND: Record<string, 'number' | 'text'> = {
  shipmentNo: 'text',
  shopIdLabel: 'text',
  returnStatus: 'text',
  statusDate: 'text',
  returnDate: 'text',
  returnReason: 'text',
  returnQty: 'number',
  storageDays: 'number',
  storageFeeRub: 'number',
  disposalFeeRub: 'number',
  buyerComment: 'text'
};
/** 明细弹窗每页行数（前端分页）。 */
const DETAIL_PAGE_SIZE = 20;
/** 产品图 x 轴每个产品占用的最小宽度，保证图片与品名不被挤在一起。 */
const SLOT_WIDTH = 62;
/** 产品图 x 轴品名的折行字数。 */
const NAME_WRAP = 5;
/** 退货主题色（橙，负面事件），两个图保持一致。 */
const BAR_COLOR = '#409eff';

const shopStore = useOzonShopStore();
const chartData = ref<OzonReturnsChartVO>();
const loading = ref(false);
const error = ref('');
// 默认不筛状态与月份，与「全部」口径一致。
const status = ref('');
const month = ref('');
const sortMode = ref<'quantity' | 'name'>('quantity');
const showImage = ref(true);
const monthChartElement = ref<HTMLElement>();
const productChartElement = ref<HTMLElement>();
let monthChart: echarts.ECharts | undefined;
let productChart: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
let requestVersion = 0;
let disposed = false;
let active = true;

const detailVisible = ref(false);
const detailProduct = ref<OzonReturnsStatsVO>();
const detailMonth = ref('');
const detailRows = ref<OzonReturnsRowVO[]>([]);
const detailLoading = ref(false);
const detailError = ref('');
const detailPage = ref(1);
const detailSortProp = ref('');
const detailSortOrder = ref<'ascending' | 'descending' | ''>('');
let detailVersion = 0;

const months = computed(() => chartData.value?.months ?? []);
const products = computed(() => chartData.value?.products ?? []);
/** 月份下拉选项：最新的月份排前面，方便选择。 */
const monthOptions = computed(() => months.value.map(item => item.month).slice().reverse());
/** 总件数取「按月趋势」合计，不受月份筛选影响，只随店铺与状态变化。 */
const totalQuantity = computed(() => months.value.reduce((sum, item) => sum + monthQty(item), 0));
const totalQuantityText = computed(() => totalQuantity.value.toLocaleString('zh-CN'));

/** 产品柱子的横向顺序：默认沿用后端的退货件数倒序。 */
const sorted = computed(() => {
  const rows = [...products.value];
  if (sortMode.value === 'name') rows.sort((a, b) => productName(a).localeCompare(productName(b), 'zh-Hans-CN'));
  return rows;
});
const monthChartHeight = computed(() => 260);
const monthChartWidth = computed(() => Math.max(months.value.length * 64, 320));
const chartHeight = computed(() => 400);
const chartWidth = computed(() => sorted.value.length * SLOT_WIDTH);
const monthChartLabel = computed(
  () => '各月份退货件数柱状图，共 ' + months.value.length + ' 个月，合计 ' + totalQuantityText.value + ' 件'
);
const chartLabel = computed(
  () => '各产品退货件数柱状图，共 ' + sorted.value.length + ' 个产品，合计 ' + amount(sorted.value.reduce((sum, item) => sum + quantity(item), 0)) + ' 件'
);

const detailName = computed(() =>
  detailMonth.value && !detailProduct.value ? detailMonth.value + ' 退货明细' : detailProduct.value ? productName(detailProduct.value) : ''
);
const detailImage = computed(() => (detailProduct.value ? imageUrl(detailProduct.value) : ''));
const detailTitle = computed(() => '退货明细 · ' + detailName.value);
const detailArticleNo = computed(() => detailProduct.value?.articleNo || '');
const detailSku = computed(() => detailProduct.value?.sku || '');
const detailTotal = computed(() => detailRows.value.reduce((sum, row) => sum + rowQuantity(row), 0));
const detailStorageFee = computed(() => detailRows.value.reduce((sum, row) => sum + Number(row.storageFeeRub || 0), 0));
/**
 * 明细行排序结果。前端对**整份**明细排序（而不是只排当前页），所以分页数字与「合计」不受影响。
 * 空值一律排到最后，与后端 `ORDER BY ... DESC` 的 NULL 行为一致。
 */
const detailSortedRows = computed(() => {
  const prop = detailSortProp.value;
  if (!prop) return detailRows.value;
  const kind = DETAIL_SORT_KIND[prop] ?? 'text';
  const direction = detailSortOrder.value === 'descending' ? -1 : 1;
  return detailRows.value
    .map(row => ({ row, key: detailSortKey(row, prop, kind) }))
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
const detailPageRows = computed(() => {
  const start = (detailPage.value - 1) * DETAIL_PAGE_SIZE;
  return detailSortedRows.value.slice(start, start + DETAIL_PAGE_SIZE);
});
const detailPageTotal = computed(() => detailPageRows.value.reduce((sum, row) => sum + rowQuantity(row), 0));

function quantity(item: OzonReturnsStatsVO) {
  const value = Number(item.returnQty);
  return Number.isFinite(value) ? value : 0;
}
function monthQty(item: OzonReturnsMonthVO) {
  const value = Number(item.returnQty);
  return Number.isFinite(value) ? value : 0;
}
function rowQuantity(row: OzonReturnsRowVO) {
  const value = Number(row.returnQty);
  return Number.isFinite(value) ? value : 0;
}
function productName(item: OzonReturnsStatsVO) {
  return (item.localProductName || item.articleNo || item.sku || '未命名产品').trim();
}
/** 产品库「货品图片」的第一张图，与表格视图的附件口径一致。 */
function imageUrl(item: OzonReturnsStatsVO) {
  return attachmentFiles(item.attachmentJson).find(file => file.image)?.cosUrl || '';
}
function amount(value: number) {
  return value.toLocaleString('zh-CN');
}
function money(value: number | string | null | undefined) {
  const num = Number(value);
  return (Number.isFinite(num) ? num : 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
/** 产品图 x 轴标签按固定字数折行，避免相邻产品的品名互相压字。 */
function wrapName(name: string) {
  const chars = Array.from(name);
  if (chars.length <= NAME_WRAP) return name;
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += NAME_WRAP) lines.push(chars.slice(index, index + NAME_WRAP).join(''));
  return lines.join('\n');
}
function detailIndex(index: number) {
  return (detailPage.value - 1) * DETAIL_PAGE_SIZE + index + 1;
}
/** 排序键；返回 null 表示该行此列为空（排序时恒放最后）。 */
function detailSortKey(row: OzonReturnsRowVO, prop: string, kind: 'number' | 'text'): number | string | null {
  const raw = (row as unknown as Record<string, unknown>)[prop];
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (kind === 'number') {
    const value = Number(text);
    return Number.isFinite(value) ? value : text;
  }
  return text;
}
/** 明细表头排序：排完整份明细后回到第 1 页。 */
function onDetailSortChange({ prop, order }: { prop: string; order: string | null }) {
  detailSortProp.value = order ? prop : '';
  detailSortOrder.value = order === 'ascending' ? 'ascending' : order === 'descending' ? 'descending' : '';
  detailPage.value = 1;
}
function monthTooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = months.value[point?.dataIndex ?? -1];
  if (!item) return '';
  return [item.month, '退货件数：' + amount(monthQty(item)) + ' 件', '货件行数：' + Number(item.shipmentCount || 0) + ' 行', '点击查看当月退货明细'].join('\n');
}
function productTooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = sorted.value[point?.dataIndex ?? -1];
  if (!item) return '';
  return [
    productName(item) + (item.articleNo ? '（' + item.articleNo + '）' : ''),
    '退货件数：' + amount(quantity(item)) + ' 件',
    '货件行数：' + Number(item.shipmentCount || 0) + ' 行',
    'SKU：' + (item.sku || '—'),
    '点击查看退货明细'
  ].join('\n');
}

async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = '';
  try {
    await shopStore.ensureLoaded().catch(() => {});
    // 不选状态/月份时不下发对应参数，后端即不过滤。
    const query: ReportQuery = {};
    if (status.value) query.status = status.value;
    if (month.value) query.month = month.value;
    const result = await listReturnsChart(scopeReportQuery(query, shopStore.selectedId));
    if (version !== requestVersion || disposed) return;
    chartData.value = result.data;
    await renderCharts();
  } catch {
    if (version === requestVersion && !disposed) {
      error.value = '退货数据查询失败，请点击刷新重试。';
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
      if (item) void openDetail({ month: item.month });
    });
  }
  return monthChart;
}
function ensureProductChart(): echarts.ECharts | undefined {
  if (!productChartElement.value) return undefined;
  if (!productChart) {
    productChart = echarts.init(productChartElement.value);
    productChart.on('click', (params: CallbackDataParams) => {
      const item = sorted.value[params.dataIndex as number];
      if (item) void openDetail({ product: item });
    });
  }
  return productChart;
}

async function renderCharts() {
  await nextTick();
  if (disposed || !active) return;
  renderMonthChart();
  renderProductChart();
  monthChart?.resize();
  productChart?.resize();
}

/** 按月趋势图：x=月份、y=退货件数，柱子可点开当月明细。 */
function renderMonthChart() {
  const chart = ensureMonthChart();
  if (!chart || !months.value.length) return;
  const rows = months.value;
  chart.setOption(
    {
      aria: { enabled: true },
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText', confine: true, formatter: monthTooltip },
      grid: { top: 34, left: 8, right: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: rows.map(item => item.month),
        axisTick: { show: false },
        axisLabel: { interval: 0, margin: 8 }
      },
      yAxis: {
        type: 'value',
        name: '退货件数（件）',
        nameLocation: 'end',
        nameGap: 14,
        nameTextStyle: { fontSize: 12 },
        minInterval: 1,
        splitLine: { lineStyle: { type: 'dashed' } },
        axisLabel: { formatter: (value: number) => amount(value) }
      },
      series: [
        {
          type: 'bar',
          data: rows.map(item => monthQty(item)),
          barMaxWidth: 40,
          cursor: 'pointer',
          itemStyle: { color: BAR_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', distance: 4, fontSize: 11, formatter: (params: CallbackDataParams) => amount(Number(params.value)) }
        }
      ]
    },
    { notMerge: true }
  );
}

/** 按产品排行图：x=货品图片+品名、y=退货件数，柱子可点开该产品明细。 */
function renderProductChart() {
  const chart = ensureProductChart();
  if (!chart || !sorted.value.length) return;
  const rows = sorted.value;
  const useImage = showImage.value;
  const images = rows.map(item => (useImage ? imageUrl(item) : ''));
  // 每个产品一个富文本样式，用 backgroundColor.image 把货品图片画在 x 轴标签里（图在上、品名在下）。
  const rich: Record<string, Record<string, unknown>> = { name: { fontSize: 11, lineHeight: 14, align: 'center' } };
  images.forEach((url, index) => {
    if (url) rich['p' + index] = { width: 22, height: 22, borderRadius: 3, align: 'center', backgroundColor: { image: url } };
  });
  chart.setOption(
    {
      aria: { enabled: true },
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText', confine: true, formatter: productTooltip },
      grid: { top: 34, left: 8, right: 16, bottom: 8, containLabel: true },
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
      yAxis: {
        type: 'value',
        name: '退货件数（件）',
        nameLocation: 'end',
        nameGap: 14,
        nameTextStyle: { fontSize: 12 },
        minInterval: 1,
        splitLine: { lineStyle: { type: 'dashed' } },
        axisLabel: { formatter: (value: number) => amount(value) }
      },
      series: [
        {
          type: 'bar',
          data: rows.map(item => quantity(item)),
          barMaxWidth: 28,
          cursor: 'pointer',
          itemStyle: { color: BAR_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', distance: 4, fontSize: 11, formatter: (params: CallbackDataParams) => amount(Number(params.value)) }
        }
      ]
    },
    { notMerge: true }
  );
}

/** 点击柱子：拉取对应的退货明细，用表格展示。month 与 product 二选一。 */
async function openDetail(options: { month?: string; product?: OzonReturnsStatsVO }) {
  const version = ++detailVersion;
  detailProduct.value = options.product;
  detailMonth.value = options.month || '';
  detailVisible.value = true;
  detailPage.value = 1;
  detailRows.value = [];
  detailError.value = '';
  detailLoading.value = true;
  try {
    // 明细必须沿用图表的筛选口径，否则行数与柱高对不上。
    const query: ReportQuery = {};
    if (status.value) query.status = status.value;
    const monthValue = options.month || month.value;
    if (monthValue) query.month = monthValue;
    if (options.product?.articleNo) query.articleNo = options.product.articleNo;
    const result = await listReturnsChartRows(scopeReportQuery(query, shopStore.selectedId));
    if (version !== detailVersion || disposed) return;
    detailRows.value = result.data ?? [];
  } catch {
    if (version === detailVersion && !disposed) detailError.value = '退货明细查询失败，请关闭弹窗后重试。';
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
      productChart?.resize();
    }
  });
  if (monthChartElement.value) observer.observe(monthChartElement.value);
  if (productChartElement.value) observer.observe(productChartElement.value);
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
  productChart?.dispose();
  productChart = undefined;
});
onBeforeUnmount(() => {
  disposed = true;
  requestVersion++;
  detailVersion++;
  observer?.disconnect();
  monthChart?.dispose();
  monthChart = undefined;
  productChart?.dispose();
  productChart = undefined;
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
.status-select { width: 132px; }
.month-select { width: 116px; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.description { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); margin: 8px 0 10px; }
.notice { margin-top: 12px; font-size: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); margin: 4px 0 8px; }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 20px; padding: 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-bg-color-overlay); color: var(--el-text-color-secondary); font-size: 12px; line-height: 1; white-space: nowrap; }
.view-refreshing-dot { display: inline-block; width: 9px; height: 9px; border: 1.5px solid var(--el-color-primary); border-top-color: transparent; border-radius: 50%; animation: view-refreshing-spin .7s linear infinite; }
@keyframes view-refreshing-spin { to { transform: rotate(360deg); } }
.chart-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
.returns-month-chart { width: 100%; }
.returns-chart { width: 100%; }
.detail-head { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; }
.detail-thumb { width: 48px; height: 48px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; object-fit: contain; flex: none; background: var(--el-fill-color-lighter); }
.detail-ident { min-width: 0; flex: 1 1 auto; }
.detail-name { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.detail-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats { display: flex; align-items: center; gap: 14px; flex: none; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats b { font-size: 14px; color: var(--el-color-primary); }
.detail-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
</style>
