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
        一个柱子代表一个产品（按「卖家货号」归并），柱高 = 该产品的交货数量合计、柱顶数字为件数。x 轴标签是产品货品图片与品名，
        图片取自产品库「货品图片」；未维护图片的产品只显示品名。鼠标悬停可看货号与申请数，<b>点击柱子可展开该产品的交货申请明细</b>。
      </p>
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />
      <el-empty v-else-if="!loading && !items.length" description="没有符合条件的交货记录" />
      <div v-show="!error && items.length" class="chart-scroll">
        <div
          ref="chartElement"
          class="supply-chart"
          :style="{ height: chartHeight + 'px', minWidth: chartWidth + 'px' }"
          role="img"
          :aria-label="chartLabel"
        />
      </div>
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
            卖家货号：{{ detailProduct?.sku || '—' }} · ItemCode：{{ detailProduct?.itemCode || '—' }}
            <template v-if="status"> · 状态：{{ status }}</template>
          </div>
        </div>
        <div class="detail-stats">
          <span>交货数量 <b>{{ amount(detailTotal) }}</b> 件</span>
          <span>明细 <b>{{ detailRows.length }}</b> 行</span>
          <span>申请 <b>{{ detailOrderCount }}</b> 个</span>
        </div>
      </div>
      <el-alert v-if="detailError" :title="detailError" type="error" show-icon :closable="false" class="notice" />
      <el-table
        v-loading="detailLoading"
        :data="detailPageRows"
        size="small"
        border
        height="460"
        :empty-text="detailLoading ? '明细加载中…' : '没有符合条件的交货明细'"
        @sort-change="onDetailSortChange"
      >
        <el-table-column type="index" label="#" width="46" align="center" :index="detailIndex" />
        <el-table-column prop="applicationNo" label="交货申请编号" width="138" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="88" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="deliveryType" label="配送类型" width="100" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="shipmentDate" label="发运日期" width="104" sortable="custom" />
        <el-table-column prop="shipmentTime" label="发运时间段" width="112" sortable="custom" />
        <el-table-column prop="completionDate" label="完成日期" width="104" sortable="custom" />
        <el-table-column prop="deliveryId" label="子交货ID" width="116" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="itemCode" label="ItemCode" width="112" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="sku" label="SKU" width="130" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="80" align="right" sortable="custom">
          <template #default="{ row }">{{ amount(Number(row.quantity) || 0) }}</template>
        </el-table-column>
        <el-table-column prop="storageCluster" label="存储集群" min-width="110" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="dispatchPoint" label="发运点" min-width="100" sortable="custom" show-overflow-tooltip />
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

<script setup lang="ts" name="OzonSupplyReport">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { listSupplyProductRows, listSupplyStats, scopeReportQuery } from '@/api/ozon/report';
import type { OzonSupplyReportVO, OzonSupplyStatsVO, ReportQuery } from '@/api/ozon/report/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import { attachmentFiles } from '../components/attachmentFiles';

echarts.use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);

/** 交货申请的状态取值，与「0.交货申请明细」的筛选口径一致。 */
const STATUS_OPTIONS = ['已完成', '已逾期', '在发运点', '已准备发运', '已取消'];
/** 明细表的排序口径：数字列按数值、日期列按日期（库内是 DD.MM.YYYY）、其余按中文文本。 */
const DETAIL_SORT_KIND: Record<string, 'number' | 'date' | 'text'> = {
  applicationNo: 'number',
  status: 'text',
  deliveryType: 'text',
  shipmentDate: 'date',
  shipmentTime: 'text',
  completionDate: 'date',
  deliveryId: 'number',
  itemCode: 'text',
  sku: 'text',
  quantity: 'number',
  storageCluster: 'text',
  dispatchPoint: 'text'
};
/** 明细弹窗每页行数（前端分页）。 */
const DETAIL_PAGE_SIZE = 20;
/** x 轴每个产品占用的最小宽度，保证图片与品名不被挤在一起。 */
const SLOT_WIDTH = 62;
/** x 轴品名的折行字数。 */
const NAME_WRAP = 5;

const shopStore = useOzonShopStore();
const items = ref<OzonSupplyStatsVO[]>([]);
const loading = ref(false);
const error = ref('');
// 默认只看已完成的交货申请。
const status = ref('已完成');
const sortMode = ref<'quantity' | 'name'>('quantity');
const showImage = ref(true);
const chartElement = ref<HTMLElement>();
let chart: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
let requestVersion = 0;
let disposed = false;
let active = true;

const detailVisible = ref(false);
const detailProduct = ref<OzonSupplyStatsVO>();
const detailRows = ref<OzonSupplyReportVO[]>([]);
const detailLoading = ref(false);
const detailError = ref('');
const detailPage = ref(1);
const detailSortProp = ref('');
const detailSortOrder = ref<'ascending' | 'descending' | ''>('');
let detailVersion = 0;

/** 柱子的横向顺序：默认沿用后端的交货数量倒序。 */
const sorted = computed(() => {
  const rows = [...items.value];
  if (sortMode.value === 'name') rows.sort((a, b) => productName(a).localeCompare(productName(b), 'zh-Hans-CN'));
  return rows;
});
const totalQuantity = computed(() => sorted.value.reduce((sum, item) => sum + quantity(item), 0));
const totalQuantityText = computed(() => totalQuantity.value.toLocaleString('zh-CN'));
const chartHeight = computed(() => 400);
const chartWidth = computed(() => sorted.value.length * SLOT_WIDTH);
const chartLabel = computed(
  () => '各产品交货数量柱状图，共 ' + sorted.value.length + ' 个产品，合计 ' + totalQuantityText.value + ' 件'
);

const detailName = computed(() => (detailProduct.value ? productName(detailProduct.value) : ''));
const detailImage = computed(() => (detailProduct.value ? imageUrl(detailProduct.value) : ''));
const detailTitle = computed(() => '交货明细 · ' + detailName.value);
const detailTotal = computed(() => detailRows.value.reduce((sum, row) => sum + rowQuantity(row), 0));
const detailOrderCount = computed(() => new Set(detailRows.value.map(row => row.orderId || '')).size);
/**
 * 明细行排序结果。前端对**整份**明细排序（而不是只排当前页），所以分页数字与「合计」不受影响。
 * 空值（未维护完成日期、单子交货的空子交货ID）一律排到最后，与后端 `ORDER BY ... DESC` 的 NULL 行为一致。
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

function quantity(item: OzonSupplyStatsVO) {
  const value = Number(item.totalQuantity);
  return Number.isFinite(value) ? value : 0;
}
function rowQuantity(row: OzonSupplyReportVO) {
  const value = Number(row.quantity);
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
/** x 轴标签按固定字数折行，避免相邻产品的品名互相压字。 */
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
function detailSortKey(row: OzonSupplyReportVO, prop: string, kind: 'number' | 'date' | 'text'): number | string | null {
  const raw = (row as unknown as Record<string, unknown>)[prop];
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (kind === 'date') {
    // 库内日期是 DD.MM.YYYY 文本，直接按字符串比会错序 → 转成 YYYYMMDD 数值再比。
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
    return match ? Number(match[3] + match[2].padStart(2, '0') + match[1].padStart(2, '0')) : null;
  }
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
function tooltip(params: CallbackDataParams | CallbackDataParams[]) {
  const point = Array.isArray(params) ? params[0] : params;
  const item = sorted.value[point?.dataIndex ?? -1];
  if (!item) return '';
  const code = productCode(item);
  return [
    productName(item) + (code ? '（' + code + '）' : ''),
    '交货数量：' + amount(quantity(item)) + ' 件',
    '交货申请数：' + Number(item.orderCount || 0) + ' 个',
    'ItemCode：' + (item.itemCode || '—'),
    '点击查看交货明细'
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
  // 每个产品一个富文本样式，用 backgroundColor.image 把货品图片画在 x 轴标签里（图在上、品名在下）。
  const rich: Record<string, Record<string, unknown>> = { name: { fontSize: 11, lineHeight: 14, align: 'center' } };
  images.forEach((url, index) => {
    if (url) rich['p' + index] = { width: 22, height: 22, borderRadius: 3, align: 'center', backgroundColor: { image: url } };
  });
  if (!chart) {
    chart = echarts.init(chartElement.value);
    chart.on('click', (params: CallbackDataParams) => {
      const item = sorted.value[params.dataIndex as number];
      if (item) void openDetail(item);
    });
  }
  chart.setOption(
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
        name: '交货数量（件）',
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
          itemStyle: { color: '#409eff', borderRadius: [3, 3, 0, 0] },
          label: { show: true, position: 'top', distance: 4, fontSize: 11, formatter: (params: CallbackDataParams) => amount(Number(params.value)) }
        }
      ]
    },
    { notMerge: true }
  );
  chart.resize();
}

/** 点击柱子：拉取该产品的交货申请明细，用表格展示。 */
async function openDetail(item: OzonSupplyStatsVO) {
  const version = ++detailVersion;
  detailProduct.value = item;
  detailVisible.value = true;
  detailPage.value = 1;
  detailRows.value = [];
  detailError.value = '';
  detailLoading.value = true;
  try {
    // 明细必须沿用图表的筛选口径，否则分页数字与柱高对不上。
    const query: ReportQuery = { sku: item.sku || '' };
    if (status.value) query.status = status.value;
    const result = await listSupplyProductRows(scopeReportQuery(query, shopStore.selectedId));
    if (version !== detailVersion || disposed) return;
    detailRows.value = result.data ?? [];
  } catch {
    if (version === detailVersion && !disposed) detailError.value = '交货明细查询失败，请关闭弹窗后重试。';
  } finally {
    if (version === detailVersion && !disposed) detailLoading.value = false;
  }
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
  detailVersion++;
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
.chart-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
.supply-chart { width: 100%; }
.detail-head { display: flex; align-items: center; gap: 12px; padding: 0 0 10px; }
.detail-thumb { width: 48px; height: 48px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; object-fit: contain; flex: none; background: var(--el-fill-color-lighter); }
.detail-ident { min-width: 0; flex: 1 1 auto; }
.detail-name { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.detail-sub { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats { display: flex; align-items: center; gap: 14px; flex: none; font-size: 12px; color: var(--el-text-color-secondary); }
.detail-stats b { font-size: 14px; color: var(--el-color-primary); }
.detail-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; }
</style>
