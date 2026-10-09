<template>
  <div class="p-2 app-container report-page">
    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">
              共 {{ months.length }} 个月 · {{ items.length }} 个货号 · 总计 {{ totalText }} RUB
            </span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot"></i>数据更新中</span>
          </div>
          <div class="view-actions">
            <el-select v-model="serviceGroup" placeholder="全部费用分组" class="group-select" aria-label="费用分组" @change="load">
              <el-option label="全部费用分组" value="" />
              <el-option v-for="option in GROUP_OPTIONS" :key="option" :label="option" :value="option" />
            </el-select>
            <el-select v-model="month" placeholder="全部月份" class="month-select" aria-label="应计月份" @change="load">
              <el-option label="全部月份" value="" />
              <el-option v-for="item in monthOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <el-radio-group v-model="sortMode" size="small" aria-label="排序方式">
              <el-radio-button value="amount">按金额</el-radio-button>
              <el-radio-button value="name">按品名</el-radio-button>
            </el-radio-group>
            <el-switch v-model="showImage" active-text="产品图片" />
            <el-button :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>
      <p class="description">
        金额口径统一为<b>「总计（RUB）」净额</b>：销售额与各项应计费用正负相抵后的合计。
        上图<b>按应计日期所属月份（按月统计）</b>汇总，下图按货号（按「卖家货号」归并）汇总，柱高 = 净额、柱顶数字为金额；
        货号的 x 轴标签是货品图片与品名（图片取自产品库「货品图片」，未维护图片的只显示品名/货号）。
        「费用分组」筛选同时作用于两个图与下钻明细，「月份」筛选作用于按货号图与下钻明细；鼠标悬停可看费用编号数，
        <b>点击柱子可展开对应的订单费用明细</b>（明细为后端分页，每页 20 行）。净额可能为负，负数柱子向下画。
      </p>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />
      <el-empty v-else-if="!loading && !months.length && !items.length" description="没有符合条件的订单费用记录" />
      <template v-else>
        <div class="section-title">按月趋势</div>
        <div v-show="months.length" class="chart-scroll">
          <div
            ref="monthChartElement"
            class="accrual-month-chart"
            :style="{ height: monthChartHeight + 'px', minWidth: monthChartWidth + 'px' }"
            role="img"
            :aria-label="monthChartLabel"
          />
        </div>
        <el-empty v-if="!months.length && !loading" description="没有订单费用记录" :image-size="72" />
        <template v-if="items.length">
          <div class="section-title">按货号排行</div>
          <div class="chart-scroll">
            <div
              ref="chartElement"
              class="accrual-chart"
              :style="{ height: chartHeight + 'px', minWidth: chartWidth + 'px' }"
              role="img"
              :aria-label="chartLabel"
            />
          </div>
        </template>
        <el-empty v-else-if="!loading" description="当前月份没有订单费用记录" :image-size="72" />
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
            <template v-else>应计月份：{{ detailMonth || '—' }}</template>
            <template v-if="serviceGroup"> · 费用分组：{{ serviceGroup }}</template>
          </div>
        </div>
        <div class="detail-stats">
          <span>净额合计 <b>{{ detailTotalText }}</b> RUB</span>
          <span>明细 <b>{{ detailTotal }}</b> 行</span>
        </div>
      </div>
      <el-alert v-if="detailError" :title="detailError" type="error" show-icon :closable="false" class="notice" />
      <el-table
        v-loading="detailLoading"
        :data="detailRows"
        size="small"
        border
        height="460"
        :empty-text="detailLoading ? '明细加载中…' : '没有符合条件的订单费用明细'"
        @sort-change="onDetailSortChange"
      >
        <el-table-column type="index" label="#" width="56" align="center" :index="detailIndex" />
        <el-table-column prop="accrualId" label="应计费用编号" width="150" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="accrualDate" label="应计日期" width="108" sortable="custom" />
        <el-table-column prop="serviceGroup" label="费用分组" width="120" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="accrualType" label="应计类型" width="160" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="sellerSku" label="卖家货号" width="140" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="productName" label="商品名称" min-width="180" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="88" align="right" sortable="custom">
          <template #default="{ row }">{{ decimal(row.quantity, 0) }}</template>
        </el-table-column>
        <el-table-column prop="totalAmountRub" label="总计（RUB）" width="128" align="right" sortable="custom">
          <template #default="{ row }"><span :class="{ negative: Number(row.totalAmountRub) < 0 }">{{ money(row.totalAmountRub) }}</span></template>
        </el-table-column>
      </el-table>
      <div class="detail-foot">
        <span class="record-count">
          本页 {{ pageTotalText }} RUB · 全部 {{ detailTotal }} 行
        </span>
        <el-pagination
          v-model:current-page="detailPage"
          :page-size="DETAIL_PAGE_SIZE"
          :total="detailTotal"
          layout="prev, pager, next"
          size="small"
          background
          @current-change="loadDetail"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="OzonAccrualsChart">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { listAccrualChart, listAccrualChartRows, scopeReportQuery } from '@/api/ozon/report';
import type { OzonAccrualChartVO, OzonAccrualMonthVO, OzonAccrualProductVO, OzonAccrualReportVO, ReportQuery } from '@/api/ozon/report/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import { attachmentFiles } from '../components/attachmentFiles';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

/** 费用分组取值，与「1.订单费用明细」的筛选口径一致（ozon_accruals.service_group）。 */
const GROUP_OPTIONS = ['销售', 'Ozon佣金', '配送服务', '合作伙伴服务', '推广与广告', 'FBO服务', '其他服务及罚款', '退货', '其他应计', '补偿与扣回'];
/** 明细后端分页每页行数；单货号单月最多 3.5 万行，必须后端分页。 */
const DETAIL_PAGE_SIZE = 20;
/** 产品图 x 轴每个货号占用的最小宽度，保证图片与品名不被挤在一起。 */
const SLOT_WIDTH = 62;
/** 产品图 x 轴品名的折行字数。 */
const NAME_WRAP = 5;
/** 订单主题色（蓝），与 0.1 交货图表 / 2.1 退货图表保持一致。 */
const BAR_COLOR = '#409eff';
/**
 * 「未标注货号」的哨兵值。
 * 图表里 seller_sku 为空的槽位（平台级费用：广告点击、FBO 跨仓中转、仓储费、债权债务抵销等）
 * 下钻时不能把空串直接当 sku 下发：若依 tansParams 对 `value === ''` 会整条跳过参数，
 * 空串进不了 URL，后端收到 null 就当成「不过滤」，会把整库明细都返回。
 * 所以约定用这个非空哨兵，由后端 OzonReportServiceImpl 翻译回空串。
 */
const NO_SKU_TOKEN = '__NO_SKU__';

const shopStore = useOzonShopStore();
const chartData = ref<OzonAccrualChartVO>();
const loading = ref(false);
const error = ref('');
const serviceGroup = ref('');
const month = ref('');
const sortMode = ref<'amount' | 'name'>('amount');
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
const detailProduct = ref<OzonAccrualProductVO>();
const detailMonth = ref('');
const detailRows = ref<OzonAccrualReportVO[]>([]);
const detailTotal = ref(0);
const detailBackAmount = ref(0);
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
/** 月份图的合计。 */
const monthTotal = computed(() => months.value.reduce((sum, item) => sum + monthAmount(item), 0));
/**
 * 表头净额取「按货号排行」的合计 —— 它跟随全部筛选（费用分组 + 月份），与下面那张图始终一致。
 */
const totalAmount = computed(() => items.value.reduce((sum, item) => sum + productAmount(item), 0));
const totalText = computed(() => money(totalAmount.value));

/** 产品柱子的横向顺序：默认沿用后端的净额倒序。 */
const sorted = computed(() => {
  const rows = [...items.value];
  if (sortMode.value === 'name') rows.sort((a, b) => productName(a).localeCompare(productName(b), 'zh-Hans-CN'));
  return rows;
});
const monthChartHeight = computed(() => 260);
const monthChartWidth = computed(() => Math.max(months.value.length * 74, 320));
const chartHeight = computed(() => 400);
const chartWidth = computed(() => sorted.value.length * SLOT_WIDTH);
const monthChartLabel = computed(
  () => '各月份订单费用净额柱状图，共 ' + months.value.length + ' 个月，合计 ' + money(monthTotal.value) + ' 卢布'
);
const chartLabel = computed(
  () => '各货号订单费用净额柱状图，共 ' + sorted.value.length + ' 个货号，合计 ' + totalText.value + ' 卢布'
);

const detailName = computed(() =>
  detailMonth.value && !detailProduct.value ? detailMonth.value + ' 订单费用明细' : detailProduct.value ? productName(detailProduct.value) : ''
);
const detailImage = computed(() => (detailProduct.value ? imageUrl(detailProduct.value) : ''));
const detailTitle = computed(() => '订单费用明细 · ' + detailName.value);
const detailTotalText = computed(() => money(detailBackAmount.value));
const pageTotalText = computed(() => money(detailRows.value.reduce((sum, row) => sum + rowAmount(row), 0)));

function monthAmount(item: OzonAccrualMonthVO) {
  const value = Number(item.totalAmountRub);
  return Number.isFinite(value) ? value : 0;
}
function productAmount(item: OzonAccrualProductVO) {
  const value = Number(item.totalAmountRub);
  return Number.isFinite(value) ? value : 0;
}
function rowAmount(row: OzonAccrualReportVO) {
  const value = Number(row.totalAmountRub);
  return Number.isFinite(value) ? value : 0;
}
function productName(item: OzonAccrualProductVO) {
  return (item.productName || item.ozonProductName || item.sku || '未标注货号').trim();
}
function productCode(item: OzonAccrualProductVO) {
  return (item.sku || '').trim();
}
/** 产品库「货品图片」的第一张图，与表格视图的附件口径一致。 */
function imageUrl(item: OzonAccrualProductVO) {
  return attachmentFiles(item.attachmentJson).find(file => file.image)?.cosUrl || '';
}
/** 金额展示：带千分位，最多两位小数。 */
function money(value: number | string | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
/** 数量展示：默认取整，避免小数位把列撑开。 */
function decimal(value: number | string | null | undefined, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** x 轴标签按固定字数折行，避免相邻货号的品名互相压字。 */
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
/** 明细表头排序走后端（后端分页），排完回到第 1 页。 */
function onDetailSortChange({ prop, order }: { prop: string; order: string | null }) {
  detailSortProp.value = order ? prop : '';
  detailSortOrder.value = order === 'ascending' ? 'ascending' : order === 'descending' ? 'descending' : '';
  detailPage.value = 1;
  void loadDetail();
}
function monthTooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = months.value[point?.dataIndex ?? -1];
  if (!item) return '';
  return [
    item.month,
    '净额：' + money(monthAmount(item)) + ' RUB',
    '费用编号数：' + Number(item.accrualCount || 0) + ' 个',
    '点击查看当月订单费用明细'
  ].join('\n');
}
function tooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = sorted.value[point?.dataIndex ?? -1];
  if (!item) return '';
  const code = productCode(item);
  return [
    productName(item) + (code ? '（' + code + '）' : ''),
    '净额：' + money(productAmount(item)) + ' RUB',
    '费用编号数：' + Number(item.accrualCount || 0) + ' 个',
    '点击查看该货号的订单费用明细'
  ].join('\n');
}

async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = '';
  try {
    await shopStore.ensureLoaded().catch(() => {});
    // 不选费用分组/月份时不下发对应参数，后端即不过滤。
    const query: ReportQuery = {};
    if (serviceGroup.value) query.serviceGroup = serviceGroup.value;
    if (month.value) query.month = month.value;
    const result = await listAccrualChart(scopeReportQuery(query, shopStore.selectedId));
    if (version !== requestVersion || disposed) return;
    chartData.value = result.data;
    await renderCharts();
  } catch {
    if (version === requestVersion && !disposed) {
      error.value = '订单费用数据查询失败，请点击刷新重试。';
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
  if (!chartElement.value) return undefined;
  if (!chart) {
    chart = echarts.init(chartElement.value);
    chart.on('click', (params: CallbackDataParams) => {
      const item = sorted.value[params.dataIndex as number];
      if (item) void openDetail({ product: item });
    });
  }
  return chart;
}

async function renderCharts() {
  await nextTick();
  if (disposed || !active) return;
  renderMonthChart();
  renderProductChart();
  monthChart?.resize();
  chart?.resize();
}

/** 按月趋势图：x=应计月份、y=净额（RUB），柱子可点开当月明细。 */
function renderMonthChart() {
  const instance = ensureMonthChart();
  if (!instance || !months.value.length) return;
  const rows = months.value;
  instance.setOption(
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
        name: '净额（RUB）',
        nameLocation: 'end',
        nameGap: 14,
        nameTextStyle: { fontSize: 12 },
        splitLine: { lineStyle: { type: 'dashed' } },
        axisLabel: { formatter: (value: number) => money(value) }
      },
      series: [
        {
          type: 'bar',
          // 负数柱子向下画，柱顶数字要落到柱子另一端，否则会压在 0 轴上。
          data: rows.map(item => ({ value: monthAmount(item), label: { position: monthAmount(item) < 0 ? 'bottom' : 'top' } })),
          barMaxWidth: 40,
          cursor: 'pointer',
          itemStyle: { color: BAR_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, distance: 4, fontSize: 11, formatter: (params: CallbackDataParams) => money(Number(params.value)) }
        }
      ]
    },
    { notMerge: true }
  );
}

/** 按货号排行图：x=货品图片+品名、y=净额（RUB），柱子可点开该货号明细。 */
function renderProductChart() {
  const instance = ensureProductChart();
  if (!instance || !sorted.value.length) return;
  const rows = sorted.value;
  const useImage = showImage.value;
  const images = rows.map(item => (useImage ? imageUrl(item) : ''));
  // 每个货号一个富文本样式，用 backgroundColor.image 把货品图片画在 x 轴标签里（图在上、品名在下）。
  const rich: Record<string, Record<string, unknown>> = { name: { fontSize: 11, lineHeight: 14, align: 'center' } };
  images.forEach((url, index) => {
    if (url) rich['p' + index] = { width: 22, height: 22, borderRadius: 3, align: 'center', backgroundColor: { image: url } };
  });
  instance.setOption(
    {
      aria: { enabled: true },
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText', confine: true, formatter: tooltip },
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
        name: '净额（RUB）',
        nameLocation: 'end',
        nameGap: 14,
        nameTextStyle: { fontSize: 12 },
        splitLine: { lineStyle: { type: 'dashed' } },
        axisLabel: { formatter: (value: number) => money(value) }
      },
      series: [
        {
          type: 'bar',
          data: rows.map(item => ({ value: productAmount(item), label: { position: productAmount(item) < 0 ? 'bottom' : 'top' } })),
          barMaxWidth: 28,
          cursor: 'pointer',
          itemStyle: { color: BAR_COLOR, borderRadius: [3, 3, 0, 0] },
          label: { show: true, distance: 4, fontSize: 10, formatter: (params: CallbackDataParams) => money(Number(params.value)) }
        }
      ]
    },
    { notMerge: true }
  );
}

/** 打开明细弹窗：先定口径与合计，再拉第 1 页。month 与 product 二选一（都不给则沿用当前月份筛选）。 */
async function openDetail(options: { month?: string; product?: OzonAccrualProductVO }) {
  detailProduct.value = options.product;
  detailMonth.value = options.month || '';
  detailVisible.value = true;
  detailPage.value = 1;
  detailSortProp.value = '';
  detailSortOrder.value = '';
  detailRows.value = [];
  detailTotal.value = 0;
  // 柱高就是这一次查询的净额合计，直接拿来当弹窗里的「净额合计」，与图上数字一致。
  detailBackAmount.value = options.product
    ? productAmount(options.product)
    : options.month
      ? monthAmount(months.value.find(item => item.month === options.month) ?? { month: '', totalAmountRub: 0, accrualCount: 0 })
      : totalAmount.value;
  await loadDetail();
}

/** 翻页 / 排序 / 首次打开：明细一律走后端分页，避免几万行一次性下发。 */
async function loadDetail() {
  const version = ++detailVersion;
  detailLoading.value = true;
  detailError.value = '';
  try {
    // 明细必须沿用图表的筛选口径，否则行数与柱高对不上。
    const query: ReportQuery = { pageNum: detailPage.value, pageSize: DETAIL_PAGE_SIZE };
    if (serviceGroup.value) query.serviceGroup = serviceGroup.value;
    const monthValue = detailMonth.value || month.value;
    if (monthValue) query.month = monthValue;
    // 图表里的「未标注货号」= seller_sku 为空，用哨兵值下发（空串会被 tansParams 丢弃，等于不传，
    // 后端会返回全量明细）；不点货号柱时整个参数不下发。
    if (detailProduct.value) query.sku = detailProduct.value.sku || NO_SKU_TOKEN;
    if (detailSortProp.value) {
      query.orderByColumn = detailSortProp.value;
      query.isAsc = detailSortOrder.value === 'ascending' ? 'ascending' : 'descending';
    }
    const result = await listAccrualChartRows(scopeReportQuery(query, shopStore.selectedId));
    if (version !== detailVersion || disposed) return;
    detailRows.value = result.data?.rows ?? [];
    detailTotal.value = Number(result.data?.total ?? 0);
  } catch {
    if (version === detailVersion && !disposed) detailError.value = '订单费用明细查询失败，请关闭弹窗后重试。';
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
.group-select { width: 150px; }
.month-select { width: 116px; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.description { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); margin: 8px 0 10px; }
.notice { margin-top: 12px; font-size: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); margin: 4px 0 8px; }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 20px; padding: 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-bg-color-overlay); color: var(--el-text-color-secondary); font-size: 12px; line-height: 1; white-space: nowrap; }
.view-refreshing-dot { display: inline-block; width: 9px; height: 9px; border: 1.5px solid var(--el-color-primary); border-top-color: transparent; border-radius: 50%; animation: view-refreshing-spin .7s linear infinite; }
@keyframes view-refreshing-spin { to { transform: rotate(360deg); } }
.chart-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
.accrual-month-chart { width: 100%; }
.accrual-chart { width: 100%; }
.detail-head { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; }
.detail-thumb { width: 48px; height: 48px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; object-fit: contain; flex: none; background: var(--el-fill-color-lighter); }
.detail-ident { min-width: 0; flex: 1 1 auto; }
.detail-name { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.detail-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats { display: flex; align-items: center; gap: 14px; flex: none; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats b { font-size: 14px; color: var(--el-color-primary); }
.detail-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
.negative { color: var(--el-color-danger); }
</style>
