<template>
  <div class="p-2 app-container cpc-page">
    <el-card shadow="never" class="cpc-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">
              共 {{ campaigns.length }} 个活动 · 有数据 {{ summaryDays }} 天 · {{ windowText }}
            </span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot" />数据更新中</span>
          </div>
          <div class="view-actions">
            <el-radio-group v-model="quick" size="small" aria-label="快捷区间">
              <el-radio-button value="7">近 7 天</el-radio-button>
              <el-radio-button value="30">近 30 天</el-radio-button>
              <el-radio-button value="month">本月</el-radio-button>
            </el-radio-group>
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              size="small"
              class="date-range"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              :clearable="false"
              @change="load"
            />
            <el-select v-model="paymentType" size="small" class="type-select" aria-label="计费方式" @change="load">
              <el-option label="全部计费" value="" />
              <el-option label="按点击 CPC" value="CPC" />
              <el-option label="按订单 CPO" value="CPO" />
            </el-select>
            <el-input
              v-model="keyword"
              size="small"
              placeholder="搜索活动名"
              clearable
              class="keyword-input"
              @keyup.enter="load"
              @clear="load"
            />
            <el-button size="small" :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>

      <p class="description">
        数据来自 <b>Ozon Performance API</b> 的按天统计（<code>/api/client/statistics/daily/json</code>），
        日期是<b>莫斯科日期</b>，每天同步 T-1（当天数据还没跑完）。一行 = 一个店铺 × 一个活动 × 一天，
        点活动前的箭头可展开<b>按天明细</b>。
        <b>ДРР</b> = 花费 ÷ 订单金额；<b>CPC</b> = 花费 ÷ 点击；<b>CTR</b> = 点击 ÷ 展示。
        注意 <b>CPC 活动停投后仍会产生订单</b>（广告归因窗口），所以会出现「花费 0、有订单额」的天，
        这类记录的 ДРР 显示「—」而不是 0%。
      </p>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />

      <template v-else>
        <div class="kpis">
          <div v-for="k in kpis" :key="k.label" class="kpi">
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-value" :class="k.tone">{{ k.value }}</div>
          </div>
        </div>

        <div class="section-title">按天趋势（花费 / 订单额 / 点击）</div>
        <div ref="chartElement" class="trend-chart" role="img" aria-label="广告按天花费与订单额趋势" />
        <el-empty v-if="!loading && !trend.length" description="该区间没有广告数据" :image-size="64" />

        <div class="section-title">活动明细（点箭头展开按天）</div>
        <el-table
          v-loading="loading"
          :data="campaigns"
          class="cpc-grid"
          size="small"
          border
          row-key="campaignId"
          :default-sort="{ prop: sortProp, order: sortOrder }"
          @sort-change="onSortChange"
          @expand-change="onExpandChange"
        >
          <el-table-column type="expand" width="40">
            <template #default="{ row }">
              <div class="expand-wrap">
                <div v-if="dailyLoading[row.campaignId]" class="expand-loading">加载中…</div>
                <el-table v-else :data="dailyMap[row.campaignId] || []" size="small" class="daily-grid">
                  <el-table-column prop="statDate" label="日期" width="110" />
                  <el-table-column label="展示" width="90" align="right"><template #default="{ row: d }">{{ int(d.views) }}</template></el-table-column>
                  <el-table-column label="点击" width="80" align="right"><template #default="{ row: d }">{{ int(d.clicks) }}</template></el-table-column>
                  <el-table-column label="CTR" width="80" align="right"><template #default="{ row: d }">{{ pct(d.ctr) }}</template></el-table-column>
                  <el-table-column label="花费 ₽" width="110" align="right"><template #default="{ row: d }">{{ money(d.spent) }}</template></el-table-column>
                  <el-table-column label="CPC ₽" width="90" align="right"><template #default="{ row: d }">{{ money(d.cpc) }}</template></el-table-column>
                  <el-table-column label="订单" width="70" align="right"><template #default="{ row: d }">{{ int(d.orders) }}</template></el-table-column>
                  <el-table-column label="订单额 ₽" width="120" align="right"><template #default="{ row: d }">{{ money(d.ordersAmount) }}</template></el-table-column>
                  <el-table-column label="ДРР" width="80" align="right"><template #default="{ row: d }">{{ pct(d.drr) }}</template></el-table-column>
                  <el-table-column prop="campaignState" label="当时状态" min-width="110">
                    <template #default="{ row: d }">{{ stateLabel(d.campaignState) }}</template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="dailyLoaded[row.campaignId] && !(dailyMap[row.campaignId] || []).length" description="该活动在区间内没有按天数据" :image-size="48" />
              </div>
            </template>
          </el-table-column>

          <el-table-column label="活动" min-width="230" prop="campaignTitle" sortable="custom">
            <template #default="{ row }">
              <div class="campaign-cell">
                <span class="campaign-name">{{ row.campaignTitle || '(未命名活动)' }}</span>
                <span class="campaign-id">#{{ row.campaignId }}</span>
                <el-tag v-if="showShopTag" size="small" type="info" class="shop-tag">{{ shopName(row.shopId) }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="计费" width="100">
            <template #default="{ row }"><span class="pill" :class="'pay-' + row.paymentType">{{ paymentLabel(row.paymentType) }}</span></template>
          </el-table-column>
          <el-table-column label="推广对象" width="100">
            <template #default="{ row }">{{ objectLabel(row.advObjectType) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <span class="state" :class="'state-' + (row.campaignState || '').replace('CAMPAIGN_STATE_', '')">{{ stateLabel(row.campaignState) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="days" label="天数" width="70" align="right" sortable="custom" />
          <el-table-column prop="views" label="展示" width="90" align="right" sortable="custom">
            <template #default="{ row }">{{ int(row.views) }}</template>
          </el-table-column>
          <el-table-column prop="clicks" label="点击" width="80" align="right" sortable="custom">
            <template #default="{ row }">{{ int(row.clicks) }}</template>
          </el-table-column>
          <el-table-column prop="ctr" label="CTR" width="80" align="right" sortable="custom">
            <template #default="{ row }">{{ pct(row.ctr) }}</template>
          </el-table-column>
          <el-table-column prop="spent" label="花费 ₽" width="110" align="right" sortable="custom">
            <template #default="{ row }"><b>{{ money(row.spent) }}</b></template>
          </el-table-column>
          <el-table-column prop="cpc" label="CPC ₽" width="90" align="right" sortable="custom">
            <template #default="{ row }">{{ money(row.cpc) }}</template>
          </el-table-column>
          <el-table-column prop="orders" label="订单" width="80" align="right" sortable="custom">
            <template #default="{ row }">{{ int(row.orders) }}</template>
          </el-table-column>
          <el-table-column prop="ordersAmount" label="订单额 ₽" width="120" align="right" sortable="custom">
            <template #default="{ row }">{{ money(row.ordersAmount) }}</template>
          </el-table-column>
          <el-table-column prop="drr" label="ДРР" width="90" align="right" sortable="custom">
            <template #default="{ row }">
              <span :class="drrTone(row.drr)">{{ pct(row.drr) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="lastDate" label="最近有数据" width="120" sortable="custom" />
        </el-table>
        <el-empty v-if="!loading && !campaigns.length" description="没有符合条件的广告活动" :image-size="64" />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="OzonCpc">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { getCpcOverview, listCpcDaily, scopeCpcQuery } from '@/api/ozon/cpc';
import type { OzonCpcCampaign, OzonCpcDaily, OzonCpcSummary, OzonCpcTrend } from '@/api/ozon/cpc/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer]);

/** 莫斯科「昨天」：Ozon 按天统计以莫斯科切日，当天数据没跑完，所以默认不过今天。 */
function mskDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}

const shopStore = useOzonShopStore();
/** 店铺范围一律跟随全局店铺（首页选择），本页不提供切换入口 —— 与其它 Ozon 视图保持一致。 */
const showShopTag = computed(() => !shopStore.scopedShopId);
const quick = ref('7');
const dateRange = ref<string[]>([mskDate(-7), mskDate(-1)]);
const paymentType = ref('');
const keyword = ref('');

const loading = ref(false);
const error = ref('');
const summary = ref<OzonCpcSummary | null>(null);
const trend = ref<OzonCpcTrend[]>([]);
const campaigns = ref<OzonCpcCampaign[]>([]);
const dailyMap = ref<Record<number, OzonCpcDaily[]>>({});
const dailyLoaded = ref<Record<number, boolean>>({});
const dailyLoading = ref<Record<number, boolean>>({});
const sortProp = ref('spent');
const sortOrder = ref<'ascending' | 'descending'>('descending');

const summaryDays = computed(() => summary.value?.days || 0);
const windowText = computed(() => (dateRange.value?.length === 2 ? `${dateRange.value[0]} ~ ${dateRange.value[1]}` : ''));

const nf0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (v: number | null | undefined) => (v === null || v === undefined ? '—' : nf0.format(v));
const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : nf2.format(v));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${nf2.format(v)}%`);

const PAYMENT_LABEL: Record<string, string> = { CPC: '按点击', CPO: '按订单', CAMPAIGN_TYPE_INVALID: '博主/社群' };
const OBJECT_LABEL: Record<string, string> = {
  SKU: '商品', SEARCH_PROMO: '搜索推广', ALL_SKU_PROMO: '全店推广', REF_BLOGGER: '博主', REF_VK: 'VK'
};
const STATE_LABEL: Record<string, string> = {
  CAMPAIGN_STATE_RUNNING: '投放中', CAMPAIGN_STATE_INACTIVE: '已暂停', CAMPAIGN_STATE_ARCHIVED: '已归档'
};
const paymentLabel = (v: string) => PAYMENT_LABEL[v] || v || '—';
const objectLabel = (v: string) => OBJECT_LABEL[v] || v || '—';
const stateLabel = (v: string) => STATE_LABEL[v] || v || '—';
function shopName(id: number) {
  return shopStore.shops.find(s => String(s.id) === String(id))?.name || `店铺 ${id}`;
}
/** ДРР 分级：>30% 红、15~30% 橙、其它常规。 */
function drrTone(v: number | null | undefined) {
  if (v === null || v === undefined) return '';
  return v > 30 ? 'drr-bad' : v > 15 ? 'drr-warn' : '';
}

const kpis = computed(() => {
  const s = summary.value;
  return [
    { label: '花费', value: s ? `${money(s.spent)} ₽` : '—', tone: 'tone-spent' },
    { label: '订单额', value: s ? `${money(s.ordersAmount)} ₽` : '—', tone: 'tone-amount' },
    { label: 'ДРР', value: s ? pct(s.drr) : '—', tone: drrTone(s?.drr) },
    { label: '展示', value: s ? int(s.views) : '—', tone: '' },
    { label: '点击', value: s ? int(s.clicks) : '—', tone: '' },
    { label: 'CTR', value: s ? pct(s.ctr) : '—', tone: '' },
    { label: 'CPC', value: s ? `${money(s.cpc)} ₽` : '—', tone: '' },
    { label: '订单', value: s ? int(s.orders) : '—', tone: '' }
  ];
});

/** 后端只返回有数据的日期，图表要补齐区间内的空白天，否则柱子会挤在一起看不出断档。 */
function filledTrend(): OzonCpcTrend[] {
  if (!dateRange.value || dateRange.value.length !== 2) return trend.value;
  const byDate = new Map(trend.value.map(t => [String(t.statDate).slice(0, 10), t]));
  const out: OzonCpcTrend[] = [];
  const start = new Date(dateRange.value[0] + 'T00:00:00');
  const end = new Date(dateRange.value[1] + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toLocaleDateString('sv-SE');
    out.push(byDate.get(key) || {
      statDate: key, views: 0, clicks: 0, orders: 0, spent: 0, ordersAmount: 0, ctr: null, cpc: null, drr: null
    });
  }
  return out;
}

let chart: echarts.ECharts | undefined;
const chartElement = ref<HTMLElement>();

function renderChart() {
  const rows = filledTrend();
  if (!chartElement.value) return;
  if (!chart) chart = echarts.init(chartElement.value);
  const dates = rows.map(r => String(r.statDate).slice(5));
  // 花费与订单额量级差 ~20 倍，共用左轴时花费柱几乎看不见 → 分双轴；
  // 点击/订单/ДРР 不画线，放进 tooltip，避免三轴挤在一起。
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = params as { dataIndex: number; seriesName: string; value: number; marker: string }[];
        if (!list || !list.length) return '';
        const r = rows[list[0].dataIndex];
        const line = (label: string, val: string) => `<div style="display:flex;justify-content:space-between;gap:18px"><span>${label}</span><b>${val}</b></div>`;
        return `<div style="font-weight:600;margin-bottom:4px">${r.statDate}</div>`
          + line('花费', `${money(r.spent)} ₽`)
          + line('订单额', `${money(r.ordersAmount)} ₽`)
          + line('ДРР', pct(r.drr))
          + line('点击', int(r.clicks))
          + line('展示', int(r.views))
          + line('CTR', pct(r.ctr));
      }
    },
    legend: { data: ['花费 ₽', '订单额 ₽'], top: 0, right: 8, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: dates, axisTick: { show: false } },
    yAxis: [
      { type: 'value', name: '', splitLine: { lineStyle: { type: 'dashed' } } },
      { type: 'value', name: '', splitLine: { show: false } }  // 轴名会和右上角图例重叠，单位靠图例里的「订单额 ₽」表达
    ],
    series: [
      { name: '花费 ₽', type: 'bar', yAxisIndex: 0, barMaxWidth: 22, itemStyle: { color: '#f2a15a', borderRadius: [3, 3, 0, 0] }, data: rows.map(r => Number(r.spent || 0)) },
      { name: '订单额 ₽', type: 'bar', yAxisIndex: 1, barMaxWidth: 22, itemStyle: { color: '#5b8ff9', borderRadius: [3, 3, 0, 0] }, data: rows.map(r => Number(r.ordersAmount || 0)) }
    ]
  }, true);
  chart.resize();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = scopeCpcQuery({
      scopeShopId: shopStore.scopedShopId,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
      paymentType: paymentType.value,
      keyword: keyword.value,
      sortBy: sortProp.value,
      desc: sortOrder.value === 'descending'
    });
    const res = await getCpcOverview(params);
    const data = res.data || ({} as never);
    summary.value = data.summary || null;
    trend.value = data.trend || [];
    campaigns.value = data.campaigns || [];
    if (!trend.value.length && !campaigns.value.length) {
      // 空区间不显示过期数字
      summary.value = null;
    }
    dailyMap.value = {};
    dailyLoaded.value = {};
    await nextTick();
    renderChart();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '广告数据加载失败';
  } finally {
    loading.value = false;
  }
}

/** 排序走后端（活动可能很多），表头 sortable="custom"。 */
function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  sortProp.value = prop || 'spent';
  sortOrder.value = order === 'ascending' ? 'ascending' : 'descending';
  load();
}

/** 展开才拉明细，避免一次把 30 个活动 × 90 天全取回来。 */
async function onExpandChange(row: OzonCpcCampaign, expanded: OzonCpcCampaign[]) {
  const opened = expanded.some(r => r.campaignId === row.campaignId);
  if (!opened || dailyLoaded.value[row.campaignId] || dailyLoading.value[row.campaignId]) return;
  dailyLoading.value = { ...dailyLoading.value, [row.campaignId]: true };
  try {
    const res = await listCpcDaily(scopeCpcQuery({
      scopeShopId: shopStore.scopedShopId,
      campaignId: row.campaignId,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1]
    }));
    dailyMap.value = { ...dailyMap.value, [row.campaignId]: res.data || [] };
    dailyLoaded.value = { ...dailyLoaded.value, [row.campaignId]: true };
  } catch {
    dailyMap.value = { ...dailyMap.value, [row.campaignId]: [] };
  } finally {
    dailyLoading.value = { ...dailyLoading.value, [row.campaignId]: false };
  }
}

function applyQuick(v: string) {
  if (v === 'month') {
    const first = mskDate(-1).slice(0, 8) + '01';
    dateRange.value = [first, mskDate(-1)];
  } else {
    const days = Number(v) || 7;
    dateRange.value = [mskDate(-days), mskDate(-1)];
  }
  load();
}

/** 全局店铺切换（首页）后本页跟着重查。 */
watch(() => shopStore.selectedId, () => load());

watch(quick, (v) => applyQuick(v));

function onResize() {
  chart?.resize();
}

onMounted(async () => {
  try {
    await shopStore.loadShops();
  } catch { /* 店铺列表失败不阻塞页面，按「全部店铺」显示 */ }
  await load();
  window.addEventListener('resize', onResize);
});

onActivated(() => {
  nextTick(() => chart?.resize());
});
onDeactivated(() => chart?.dispose());
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = undefined;
});
</script>

<style scoped>
.cpc-page { --cpc-border: var(--el-border-color-lighter); }
.cpc-card :deep(.el-card__header) { padding: 8px 12px; }
.cpc-card :deep(.el-card__body) { padding: 8px 12px 12px; }
.table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.view-controls, .view-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.type-select { width: 120px; }
.keyword-input { width: 160px; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-color-primary); }
.view-refreshing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-primary); animation: cpc-blink 1s infinite; }
@keyframes cpc-blink { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
.description { margin: 2px 0 10px; font-size: 12px; line-height: 20px; color: var(--el-text-color-secondary); }
.description code { background: var(--el-fill-color-light); padding: 0 4px; border-radius: 4px; }
.notice { margin-bottom: 10px; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 8px; margin-bottom: 4px; }
.kpi { border: 1px solid var(--cpc-border); border-radius: 8px; padding: 8px 10px; background: var(--el-fill-color-lighter); }
.kpi-label { font-size: 12px; color: var(--el-text-color-secondary); }
.kpi-value { font-size: 18px; font-weight: 600; line-height: 26px; color: #1f2329; font-variant-numeric: tabular-nums; }
.kpi-value.tone-spent { color: #b45309; }
.kpi-value.tone-amount { color: #245bdb; }
.kpi-value.drr-bad { color: #c02b2b; }
.kpi-value.drr-warn { color: #a85400; }

.section-title { margin: 14px 0 6px; font-size: 13px; font-weight: 600; color: #1f2329; }
.trend-chart { width: 100%; height: 260px; }
.cpc-grid { width: 100%; }
.campaign-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }
.campaign-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
.campaign-id { font-size: 12px; color: var(--el-text-color-placeholder); }
.shop-tag { margin-left: 2px; }

.pill { display: inline-block; height: 22px; padding: 0 8px; border-radius: 11px; font-size: 12px; line-height: 22px; color: #1f2329; }
.pill.pay-CPC { background: #e1eaff; }
.pill.pay-CPO { background: #ffe9d6; }
.pill.pay-CAMPAIGN_TYPE_INVALID { background: #eff0f1; }

.state { font-size: 12px; }
.state-RUNNING { color: #237b19; }
.state-INACTIVE { color: var(--el-text-color-secondary); }
.state-ARCHIVED { color: var(--el-text-color-placeholder); }

.drr-bad { color: #c02b2b; font-weight: 600; }
.drr-warn { color: #a85400; }
.expand-wrap { padding: 6px 12px 10px 12px; background: var(--el-fill-color-lighter); }
.expand-loading { font-size: 12px; color: var(--el-text-color-secondary); padding: 6px 0; }
.daily-grid :deep(.el-table__cell) { padding: 2px 0; }

:global(html.dark) .kpi-value { color: var(--el-text-color-primary); }
:global(html.dark) .section-title { color: var(--el-text-color-primary); }
</style>
