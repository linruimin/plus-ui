<template>
  <div class="p-2 app-container report-page">
    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">共 {{ items.length }} 个产品 · 交货 {{ totalQuantityText }} 件</span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot"></i>数据更新中</span>
          </div>
          <div class="view-actions">
            <el-select v-model="status" placeholder="全部状态" class="status-select" aria-label="申请状态" @change="load">
              <el-option label="全部状态" value="" />
              <el-option v-for="option in STATUS_OPTIONS" :key="option" :label="option" :value="option" />
            </el-select>
            <el-radio-group v-model="sortMode" size="small" aria-label="排序方式">
              <el-radio-button value="quantity">按交货数量</el-radio-button>
              <el-radio-button value="name">按品名</el-radio-button>
            </el-radio-group>
            <el-switch v-model="showImage" active-text="产品图片" />
            <el-button :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>
      <p class="description">
        一个柱子代表一个产品（按「卖家货号」归并），柱长 = 该产品的交货数量合计、柱端数字为件数；状态筛选不影响已归并的产品，
        只改变参与合计的申请。y 轴标签是产品货品图片与品名，图片取自产品库「货品图片」；未维护图片的产品只显示品名，鼠标悬停可看货号与申请数。
      </p>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />
      <el-empty v-else-if="!loading && !items.length" description="没有符合条件的交货记录" />
      <div
        v-show="!error && items.length"
        ref="chartElement"
        class="supply-chart"
        :style="{ height: chartHeight + 'px' }"
        role="img"
        :aria-label="chartLabel"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts" name="OzonSupplyReport">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { listSupplyStats, scopeReportQuery } from '@/api/ozon/report';
import type { OzonSupplyStatsVO, ReportQuery } from '@/api/ozon/report/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import { attachmentFiles } from '../components/attachmentFiles';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

/** 交货申请的状态取值，与「0.交货申请明细」的筛选口径一致。 */
const STATUS_OPTIONS = ['已完成', '已逾期', '在发运点', '已准备发运', '已取消'];

const shopStore = useOzonShopStore();
const items = ref<OzonSupplyStatsVO[]>([]);
const loading = ref(false);
const error = ref('');
const status = ref('');
const sortMode = ref<'quantity' | 'name'>('quantity');
const showImage = ref(true);
const chartElement = ref<HTMLElement>();
let chart: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
let requestVersion = 0;
let disposed = false;
let active = true;

/** 柱子的纵向顺序：默认沿用后端的交货数量倒序。 */
const sorted = computed(() => {
  const rows = [...items.value];
  if (sortMode.value === 'name') rows.sort((a, b) => productName(a).localeCompare(productName(b), 'zh-Hans-CN'));
  return rows;
});
const totalQuantity = computed(() => sorted.value.reduce((sum, item) => sum + quantity(item), 0));
const totalQuantityText = computed(() => totalQuantity.value.toLocaleString('zh-CN'));
const chartHeight = computed(() => Math.max(320, sorted.value.length * 30 + 90));
const chartLabel = computed(
  () => '各产品交货数量条形图，共 ' + sorted.value.length + ' 个产品，合计 ' + totalQuantityText.value + ' 件'
);

function quantity(item: OzonSupplyStatsVO) {
  const value = Number(item.totalQuantity);
  return Number.isFinite(value) ? value : 0;
}
function productName(item: OzonSupplyStatsVO) {
  return (item.localProductName || item.itemCode || item.sku || '未命名产品').trim();
}
function productCode(item: OzonSupplyStatsVO) {
  return (item.sku || item.itemCode || '').trim();
}
/** 产品库「货品图片」的第一张图，与表格视图的附件口径一致。 */
function imageUrl(item: OzonSupplyStatsVO) {
  return attachmentFiles(item.attachmentJson).find(file => file.image)?.cosUrl || '';
}
function amount(value: number) {
  return value.toLocaleString('zh-CN');
}
function tooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = sorted.value[point?.dataIndex ?? -1];
  if (!item) return '';
  const code = productCode(item);
  return [
    productName(item) + (code ? '（' + code + '）' : ''),
    '交货数量：' + amount(quantity(item)) + ' 件',
    '交货申请数：' + Number(item.orderCount || 0) + ' 个',
    'ItemCode：' + (item.itemCode || '—')
  ].join('\n');
}

async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = '';
  try {
    await shopStore.ensureLoaded().catch(() => {});
    // 不选状态时不下发 status，后端即不过滤申请状态。
    const query: ReportQuery = {};
    if (status.value) query.status = status.value;
    const result = await listSupplyStats(scopeReportQuery(query, shopStore.selectedId));
    if (version !== requestVersion || disposed) return;
    items.value = result.data ?? [];
    await renderChart();
  } catch {
    if (version === requestVersion && !disposed) {
      error.value = '交货数据查询失败，请点击刷新重试。';
      items.value = [];
    }
  } finally {
    if (version === requestVersion && !disposed) loading.value = false;
  }
}

async function renderChart() {
  await nextTick();
  if (disposed || !active || !chartElement.value || !sorted.value.length) return;
  const rows = sorted.value;
  const useImage = showImage.value;
  const images = rows.map(item => (useImage ? imageUrl(item) : ''));
  // 每个产品一个富文本样式，用 backgroundColor.image 把货品图片画在 y 轴标签里。
  const rich: Record<string, Record<string, unknown>> = {};
  images.forEach((url, index) => {
    if (url) rich['p' + index] = { width: 22, height: 22, borderRadius: 3, align: 'center', backgroundColor: { image: url } };
  });
  if (!chart) chart = echarts.init(chartElement.value);
  chart.setOption(
    {
      aria: { enabled: true },
      animation: false,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText', confine: true, formatter: tooltip },
      grid: { top: 12, left: 8, right: 78, bottom: 30, containLabel: true },
      xAxis: {
        type: 'value',
        name: '交货数量（件）',
        nameLocation: 'middle',
        nameGap: 26,
        minInterval: 1,
        splitLine: { lineStyle: { type: 'dashed' } },
        axisLabel: { formatter: (value: number) => amount(value) }
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map(item => productName(item)),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          margin: 10,
          formatter: (value: string, index: number) => (images[index] ? '{p' + index + '|}' + '  ' : '') + value,
          rich
        }
      },
      series: [
        {
          type: 'bar',
          data: rows.map(item => quantity(item)),
          barMaxWidth: 20,
          itemStyle: { color: '#409eff', borderRadius: [0, 3, 3, 0] },
          label: { show: true, position: 'right', distance: 6, fontSize: 12, formatter: (params: CallbackDataParams) => amount(Number(params.value)) }
        }
      ]
    },
    { notMerge: true }
  );
  chart.resize();
}

watch([sortMode, showImage], () => void renderChart());
watch(() => shopStore.selectionKey, () => void load());
onMounted(() => {
  observer = new ResizeObserver(() => {
    if (active) chart?.resize();
  });
  if (chartElement.value) observer.observe(chartElement.value);
  void load();
});
onActivated(() => {
  active = true;
  void renderChart();
});
onDeactivated(() => {
  active = false;
  chart?.dispose();
  chart = undefined;
});
onBeforeUnmount(() => {
  disposed = true;
  requestVersion++;
  observer?.disconnect();
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
.view-actions { flex: none; margin-left: auto; }
.view-actions :deep(.el-button + .el-button) { margin-left: 0; }
.status-select { width: 132px; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.description { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); margin: 8px 0 10px; }
.notice { margin-top: 12px; font-size: 12px; }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 20px; padding: 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-bg-color-overlay); color: var(--el-text-color-secondary); font-size: 12px; line-height: 1; white-space: nowrap; }
.view-refreshing-dot { display: inline-block; width: 9px; height: 9px; border: 1.5px solid var(--el-color-primary); border-top-color: transparent; border-radius: 50%; animation: view-refreshing-spin .7s linear infinite; }
@keyframes view-refreshing-spin { to { transform: rotate(360deg); } }
.supply-chart { width: 100%; }
</style>
