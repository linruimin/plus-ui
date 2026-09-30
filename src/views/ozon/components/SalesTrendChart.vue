<template>
  <section class="sales-trend">
    <div class="chart-controls">
      <el-select v-model="selectedProduct" filterable :disabled="productsLoading" placeholder="选择产品查看逐笔变化" aria-label="选择逐笔销售产品" class="product-select" @change="loadSales">
        <el-option v-for="product in products" :key="product.productKey" :label="productLabel(product)" :value="product.productKey" />
      </el-select>
      <el-radio-group v-model="rangeMode" size="small" aria-label="销售笔数显示范围" @change="resetZoom">
        <el-radio-button value="recent">最近 200 笔</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <el-switch v-model="showAverage" active-text="10 笔均线" @change="updateSeries" />
      <el-button :loading="loading" icon="Refresh" @click="loadProducts">刷新</el-button>
    </div>
    <p class="description">已排除费用编号总计为 0 的记录。每个点代表该费用编号下产品的销售额，收入、积分等正金额合并。按订单受理／服务日期排列；上方筛选仍按最近应计日期生效。</p>
    <div v-if="currentProduct && !error" class="sales-stats">
      <div><span>筛选范围内笔数</span><strong>{{ Number(currentProduct.saleCount).toLocaleString() }} <small>笔</small></strong></div>
      <div><span>销售额合计</span><strong>{{ money(currentProduct.salesAmountRub) }} <small>RUB</small></strong></div>
      <div><span>平均每笔</span><strong>{{ money(Number(currentProduct.salesAmountRub) / Number(currentProduct.saleCount)) }} <small>RUB</small></strong></div>
    </div>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <div v-loading="loading" class="chart-body">
      <el-empty v-if="!loading && !error && !sales.length" description="没有符合条件的销售记录" />
      <div v-show="!error && sales.length" ref="chartElement" class="trend-chart" role="img" aria-label="所选产品逐笔销售额及最近十笔平均线，单位卢布" />
    </div>
    <p v-if="sales.length && !error" class="chart-hint">每个点保留一笔销售，同一天多笔不会合并；同日按明细行号排列，不代表日内成交先后。拖动底部滑块查看历史，点击销售点查看费用明细。均线从第 10 笔开始，包含该笔及前 9 笔。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onActivated, onDeactivated, onBeforeUnmount, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { listSalesProducts, listSalesTransactions } from '@/api/ozon/report';
import { readPreference, writePreference } from './preferences';
import { ElMessage } from 'element-plus';
import type { ReportQuery, SalesProduct, ProductSale } from '@/api/ozon/report/types';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, CanvasRenderer]);
const props = defineProps<{ query: ReportQuery; storageKey: string }>();
const emit = defineEmits<{ detail: [row: { accrualId: string }] }>();
const saved = readPreference(props.storageKey);
const products = ref<SalesProduct[]>([]);
const selectedProduct = ref(typeof saved.selectedProduct === 'string' ? saved.selectedProduct : '');
const sales = ref<ProductSale[]>([]);
const productsLoading = ref(false);
const salesLoading = ref(false);
const loading = computed(() => productsLoading.value || salesLoading.value);
const error = ref('');
const rangeMode = ref(saved.rangeMode === 'all' ? 'all' : 'recent');
const showAverage = ref(saved.showAverage !== false);
const chartElement = ref<HTMLElement>();
const currentProduct = computed(() => products.value.find(product => product.productKey === selectedProduct.value));
const amounts = computed(() => sales.value.map(row => Number(row.salesAmountRub)));
const averages = computed(() => {
  let sum = 0;
  return amounts.value.map((value, index) => {
    sum += value;
    if (index >= 10) sum -= amounts.value[index - 10];
    return index >= 9 ? sum / 10 : null;
  });
});
let chart: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
let productVersion = 0;
let salesVersion = 0;
let disposed = false;
let active = true;
let storageWarningShown = false;
watch([selectedProduct, rangeMode, showAverage], () => {
  const ok = writePreference(props.storageKey, { selectedProduct: selectedProduct.value, rangeMode: rangeMode.value, showAverage: showAverage.value });
  if (!ok && !storageWarningShown) { storageWarningShown = true; ElMessage.warning('浏览器无法保存图表选择，重新打开后可能无法恢复。'); }
});

function money(value: number | string) {
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function productLabel(product: SalesProduct) {
  return product.productName + (product.sellerSku ? ' · ' + product.sellerSku : '') + '（' + product.saleCount + ' 笔）';
}
function date(value?: string) { return value?.slice(0, 10) || '日期未知'; }
async function loadProducts() {
  const version = ++productVersion;
  ++salesVersion;
  productsLoading.value = true;
  salesLoading.value = false;
  error.value = '';
  sales.value = [];
  products.value = [];
  try {
    const result = await listSalesProducts(props.query);
    if (version !== productVersion || disposed) return;
    products.value = result.data ?? [];
    if (!products.value.some(product => product.productKey === selectedProduct.value)) {
      selectedProduct.value = products.value[0]?.productKey ?? '';
    }
    await loadSales();
  } catch {
    if (version === productVersion && !disposed) error.value = '产品列表查询失败，请点击刷新重试。';
  } finally {
    if (version === productVersion && !disposed) productsLoading.value = false;
  }
}
async function loadSales() {
  const version = ++salesVersion;
  salesLoading.value = true;
  sales.value = [];
  error.value = '';
  try {
    if (!selectedProduct.value) return;
    const result = await listSalesTransactions({ ...props.query, productKey: selectedProduct.value });
    if (version !== salesVersion || disposed) return;
    sales.value = result.data ?? [];
    await renderChart();
  } catch {
    if (version === salesVersion && !disposed) error.value = '逐笔销售查询失败，请点击刷新重试。';
  } finally {
    if (version === salesVersion && !disposed) salesLoading.value = false;
  }
}
function seriesOptions() {
  return [
    { id: 'sales', name: '每笔销售额', type: 'line', data: amounts.value, symbol: 'circle', symbolSize: 5, showAllSymbol: true, smooth: false, lineStyle: { width: 1, opacity: 0.55 }, itemStyle: { color: '#409eff' } },
    { id: 'average', name: '最近 10 笔平均', type: 'line', data: showAverage.value ? averages.value : [], symbol: 'none', connectNulls: false, smooth: false, lineStyle: { width: 2.5, color: '#e6a23c' }, itemStyle: { color: '#e6a23c' } }
  ];
}
function tooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const index = point.dataIndex;
  const row = sales.value[index];
  if (!row) return '';
  const previous = index > 0 ? amounts.value[index - 1] : undefined;
  const delta = previous === undefined ? undefined : amounts.value[index] - previous;
  const parts = [
    '第 ' + (index + 1) + ' 笔 · ' + date(row.saleDate),
    '销售额：' + money(row.salesAmountRub) + ' RUB',
    '费用编号：' + row.accrualId,
    '最近应计日期：' + date(row.accrualDate)
  ];
  if (delta !== undefined) parts.push('较上一笔：' + (delta > 0 ? '+' : '') + money(delta) + ' RUB');
  if (showAverage.value && averages.value[index] !== null) parts.push('10 笔平均：' + money(averages.value[index]!) + ' RUB');
  parts.push('点击销售点查看费用明细');
  return parts.join('\n');
}
async function renderChart() {
  await nextTick();
  if (disposed || !active || !chartElement.value?.clientWidth || !sales.value.length) return;
  if (!chart) {
    chart = echarts.init(chartElement.value);
    chart.on('click', params => {
      if (params.seriesId !== 'sales') return;
      const row = sales.value[params.dataIndex];
      if (row) emit('detail', { accrualId: row.accrualId });
    });
  }
  chart.setOption({
    aria: { enabled: true },
    animation: false,
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true, formatter: tooltip },
    legend: { top: 0, selectedMode: false },
    grid: { top: 50, left: 16, right: 20, bottom: 80, containLabel: true },
    xAxis: { type: 'category', name: '按日期排列的每笔销售', nameLocation: 'middle', nameGap: 28, boundaryGap: true,
      data: sales.value.map((_, index) => String(index)),
      axisLabel: { hideOverlap: true, formatter: (value: string) => date(sales.value[Number(value)]?.saleDate) }
    },
    yAxis: { type: 'value', name: '每笔销售额（RUB）' },
    dataZoom: [{ type: 'slider', bottom: 5, height: 22, showDetail: false }, { type: 'inside' }],
    series: seriesOptions()
  }, { notMerge: true });
  resetZoom();
  chart.resize();
}
function resetZoom() {
  chart?.dispatchAction({ type: 'dataZoom', startValue: rangeMode.value === 'recent' ? Math.max(0, sales.value.length - 200) : 0, endValue: Math.max(0, sales.value.length - 1) });
}
function updateSeries() { chart?.setOption({ series: seriesOptions() }); }
watch(() => props.query, loadProducts, { immediate: true });
onMounted(() => {
  observer = new ResizeObserver(() => { if (active) chart?.resize(); });
  if (chartElement.value) observer.observe(chartElement.value);
});
onActivated(() => { active = true; renderChart(); });
onDeactivated(() => { active = false; chart?.dispose(); chart = undefined; });
onBeforeUnmount(() => {
  disposed = true;
  ++productVersion;
  ++salesVersion;
  observer?.disconnect();
  chart?.dispose();
  chart = undefined;
});
</script>

<style scoped>
.sales-trend { padding: 10px 0 4px; min-height: 320px; }
.chart-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.product-select { width: min(520px, 100%); }
.description, .chart-hint { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); margin: 10px 0; }
.sales-stats { display: flex; flex-wrap: wrap; gap: 14px 36px; margin: 12px 0; }
.sales-stats > div { display: flex; flex-direction: column; gap: 4px; }
.sales-stats span { font-size: 12px; color: var(--el-text-color-secondary); }
.sales-stats strong { font-size: 19px; font-variant-numeric: tabular-nums; }
.sales-stats small { font-size: 12px; font-weight: normal; }
.chart-body { min-height: 240px; }
.trend-chart { width: 100%; height: clamp(260px, 48vh, 600px); }
</style>
