<template>
  <div class="p-2 app-container order-trend-page">
    <el-card shadow="never" class="trend-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">
              共 {{ summary?.days || 0 }} 天有成交 · 订单 {{ int(summary?.orders) }} 单 · 售出 {{ int(summary?.units) }} 件 · 销售额 {{ money(summary?.gmv) }} ₽
            </span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot" />数据更新中</span>
          </div>
          <div class="view-actions">
            <el-radio-group v-model="quick" size="small" aria-label="快捷区间">
              <el-radio-button value="7">近 7 天</el-radio-button>
              <el-radio-button value="14">近 14 天</el-radio-button>
              <el-radio-button value="30">近 30 天</el-radio-button>
              <el-radio-button value="month">本月</el-radio-button>
              <el-radio-button value="90">近 90 天</el-radio-button>
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
            <el-button size="small" :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>

      <p class="description">
        参考 Ozon 网页后台首页的<b>订单 / 销售额动态</b>做成按天视角，口径与首页一致 —— 都是
        <b>下单口径</b>：订单数取 <code>/v3/posting/fbo/list</code> 的发货单条数（按下单时间转莫斯科时区切日），
        销售额取 <code>/v1/analytics/data</code> 的下单金额，件数取发货单商品数量。
        <b>库存件数</b>取每天 17:00 那条链路下载的库存快照（<code>ozon_stock_daily</code>），
        <b>广告花费</b>取 <code>ozon_cpc_daily</code>，<b>退货</b>取 <code>ozon_returns</code> 的退货日期。
        <b>客单价</b> = 销售额 ÷ 订单数，<b>ДРР</b> = 广告花费 ÷ 销售额。
        日期按 <b>莫斯科自然日</b>，<b>只到昨天（T-1）</b> —— 今天还没结束，取进来只会是个偏小的半天数，所以不显示。
        <br />
        <br />
        ⚠️ 首页的<b>历史金额会按当前售价重算</b>（改价后老日期跟着变），这里存的是<b>下单时的成交价</b>
        —— 所以越早的日期和首页差得越多。最近几天价格没动，两边几乎完全相等（实测 11-01~11-05 比值 1.000）；
        例：10-22 两边都是 83 件，首页 7,349 ₽（按现在的售价），我们 11,806 ₽（当时的成交价）。
        <br />
        ⚠️ 这里<b>不是</b>「1.订单费用明细」的应计数：应计要等订单送达才落账，会比首页晚 2~3 天
        （实测 11-04 首页 330 单、应计只有 116 单），两者不要互相核对。
        另外本店商品基本<b>一单一件</b>，所以「订单数」和「售出件数」经常完全一样，不是重复计算。
        下方明细表<b>点日期行最前面的箭头可展开</b>，看这一天具体卖了哪些商品。
      </p>
      <p v-if="stockHint" class="hint">{{ stockHint }}</p>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />

      <template v-else>
        <div class="kpis">
          <div v-for="k in kpis" :key="k.label" class="kpi">
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-value" :class="k.tone">{{ k.value }}</div>
            <div class="kpi-foot">
              <span v-if="k.delta !== null" class="delta" :class="k.delta > 0 ? 'up' : k.delta < 0 ? 'down' : ''">
                {{ k.delta > 0 ? '↑' : k.delta < 0 ? '↓' : '=' }} {{ deltaText(k.delta) }}%
              </span>
              <span class="kpi-sub">{{ k.sub }}</span>
            </div>
          </div>
        </div>

        <div class="section-title">订单与销售额（按天）</div>
        <div ref="mainChartElement" class="main-chart" role="img" aria-label="按天订单数与销售额趋势" />
        <el-empty v-if="!loading && !rows.length" description="该区间没有订单数据" :image-size="64" />

        <div class="duo">
          <div class="duo-main">
            <div class="section-title">库存与售出（可售件数 / 售出件数）</div>
            <div ref="stockChartElement" class="stock-chart" role="img" aria-label="按天可售库存与售出件数" />
            <div v-if="!loading && !summary?.stockQty && !stockDays" class="chart-empty">该区间还没有库存快照</div>
          </div>
          <div class="duo-side">
            <div class="section-title">热销商品 TOP {{ topProducts.length || 10 }}</div>
            <el-table :data="topProducts" size="small" class="top-grid" :show-header="true" max-height="252">
              <el-table-column type="index" label="#" width="38" align="center" />
              <el-table-column label="商品" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="product-cell">
                    <span class="product-name">{{ row.productName || row.sellerSku }}</span>
                    <span class="product-sku">{{ row.sellerSku }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="件数" width="64" align="right">
                <template #default="{ row }">{{ int(row.units) }}</template>
              </el-table-column>
              <el-table-column label="销售额 ₽" width="96" align="right">
                <template #default="{ row }">{{ money(row.gmv) }}</template>
              </el-table-column>
            </el-table>
            <div v-if="!loading && !topProducts.length" class="chart-empty">该区间没有销售明细</div>
          </div>
        </div>

        <div class="section-title">
          各商品当前库存
          <span v-if="stockDate" class="section-sub">快照 {{ stockDate }} · 可售 {{ int(stockAvailableTotal) }} 件 / 在仓 {{ int(stockTotalAll) }} 件</span>
        </div>
        <div ref="stockByProductElement" class="stock-by-product" :style="{ height: stockChartHeight + 'px' }" role="img" aria-label="各商品当前库存" />
        <div v-if="!loading && !stock.length" class="chart-empty">还没有库存快照</div>

        <div class="section-title">按天明细</div>
        <el-table
          v-loading="loading"
          :data="tableRows"
          class="trend-grid"
          size="small"
          border
          row-key="statDate"
          :default-sort="{ prop: 'statDate', order: 'descending' }"
          show-summary
          :summary-method="summaryMethod"
          @expand-change="onExpandChange"
        >
          <el-table-column type="expand" width="34">
            <template #default="{ row }">
              <div class="expand-wrap">
                <div v-if="skuLoading[row.statDate]" class="expand-loading">加载中…</div>
                <template v-else>
                  <el-table :data="skuByDate[row.statDate] || []" size="small" class="sku-grid" max-height="320">
                    <el-table-column type="index" label="#" width="38" align="center" />
                    <el-table-column label="商品" min-width="220" show-overflow-tooltip>
                      <template #default="p">
                        <div class="product-cell">
                          <span class="product-name">{{ p.row.productName || p.row.sellerSku }}</span>
                          <span class="product-sku">{{ p.row.sellerSku }}</span>
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column label="件数" width="72" align="right">
                      <template #default="p">{{ int(p.row.units) }}</template>
                    </el-table-column>
                    <el-table-column label="金额 ₽" width="104" align="right">
                      <template #default="p">{{ money(p.row.gmv) }}</template>
                    </el-table-column>
                    <el-table-column label="件单价 ₽" width="104" align="right">
                      <template #default="p">{{ money(p.row.avgPrice) }}</template>
                    </el-table-column>
                    <el-table-column label="占当日" width="92" align="right">
                      <template #default="p">{{ share(p.row, row) }}</template>
                    </el-table-column>
                  </el-table>
                  <div v-if="!(skuByDate[row.statDate] || []).length" class="expand-loading">这一天没有单品明细</div>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="statDate" label="日期" width="112" sortable />
          <el-table-column prop="orders" label="订单数" width="90" align="right" sortable>
            <template #default="{ row }">{{ int(row.orders) }}</template>
          </el-table-column>
          <el-table-column prop="units" label="售出件数" width="96" align="right" sortable>
            <template #default="{ row }">{{ int(row.units) }}</template>
          </el-table-column>
          <el-table-column prop="gmv" label="销售额 ₽" width="120" align="right" sortable>
            <template #default="{ row }"><b>{{ money(row.gmv) }}</b></template>
          </el-table-column>
          <el-table-column prop="avgOrder" label="客单价 ₽" width="106" align="right" sortable>
            <template #default="{ row }">{{ money(row.avgOrder) }}</template>
          </el-table-column>
          <el-table-column prop="cpcSpent" label="广告花费 ₽" width="110" align="right" sortable>
            <template #default="{ row }">{{ money(row.cpcSpent) }}</template>
          </el-table-column>
          <el-table-column prop="drr" label="ДРР" width="84" align="right" sortable>
            <template #default="{ row }">{{ pct(row.drr) }}</template>
          </el-table-column>
          <el-table-column prop="returns" label="退货件" width="86" align="right" sortable>
            <template #default="{ row }">{{ row.returns ? int(row.returns) : '—' }}</template>
          </el-table-column>
          <el-table-column prop="stockQty" label="可售库存" width="100" align="right" sortable>
            <template #default="{ row }">{{ n(row.stockQty) === null ? '—' : int(row.stockQty) }}</template>
          </el-table-column>
          <el-table-column prop="stockTotalQty" label="在仓+在途" width="104" align="right" sortable>
            <template #default="{ row }">{{ n(row.stockTotalQty) === null ? '—' : int(row.stockTotalQty) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && !rows.length" description="没有符合条件的记录" :image-size="64" />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="OzonOrderTrend">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { getOrderTrend, getStock, listDailySku, scopeOrderTrendQuery } from '@/api/ozon/order-trend';
import type { OzonOrderTrendProduct, OzonOrderTrendRow, OzonOrderTrendSummary, OzonStockItem } from '@/api/ozon/order-trend/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer]);

/** 莫斯科「昨天」：应计按莫斯科切日，且当天还没结算完，所以默认不过今天。 */
function mskDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}

const shopStore = useOzonShopStore();
const quick = ref('14');
// 只看**完整的日子**：区间一律截止到昨天（莫斯科 T-1），今天的半天数据不展示
const dateRange = ref<string[]>([mskDate(-14), mskDate(-1)]);

const loading = ref(false);
const error = ref('');
const summary = ref<OzonOrderTrendSummary | null>(null);
const prev = ref<OzonOrderTrendSummary | null>(null);
const rows = ref<OzonOrderTrendRow[]>([]);
const topProducts = ref<OzonOrderTrendProduct[]>([]);
const stockDays = ref(0);

const nf0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * 后端 BigDecimal 序列化成**字符串**（"0.00"），所以所有数值先统一转 Number 再算：
 * 直接拿字符串做除法会得到 Infinity（"0.00" 转数字是 0），第一版就踩了这个坑。
 */
type Num = number | string | null | undefined;
const n = (v: Num): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const int = (v: Num) => { const x = n(v); return x === null ? '—' : nf0.format(x); };
const money = (v: Num) => { const x = n(v); return x === null ? '—' : nf2.format(x); };
const pct = (v: Num) => { const x = n(v); return x === null ? '—' : `${nf2.format(x)}%`; };

/** 环比：上一等长周期为 0 或没有数据时不出百分比（避免「+∞%」）。 */
function delta(cur: Num, before: Num): number | null {
  const c = n(cur);
  const b = n(before);
  if (c === null || b === null || b === 0) return null;
  return ((c - b) / b) * 100;
}

/** 涨跌幅可能几千%（新店上期基数极小），超过 999% 就只标「>999%」，别让卡片变成一串天文数字。 */
function deltaText(value: number): string {
  const abs = Math.abs(value);
  return abs > 999 ? '>999' : abs.toFixed(1);
}

const kpis = computed(() => {
  const s = summary.value;
  const p = prev.value;
  return [
    { label: '订单数', value: s ? int(s.orders) : '—', tone: 'tone-orders', delta: delta(s?.orders, p?.orders), sub: '比上一周期' },
    { label: '销售额', value: s ? `${money(s.gmv)} ₽` : '—', tone: 'tone-gmv', delta: delta(s?.gmv, p?.gmv), sub: '下单金额 · 比上一周期' },
    { label: '售出件数', value: s ? int(s.units) : '—', tone: '', delta: delta(s?.units, p?.units), sub: '发货单件数 · 比上一周期' },
    { label: '平均客单价', value: s ? `${money(s.avgOrder)} ₽` : '—', tone: '', delta: delta(s?.avgOrder, p?.avgOrder), sub: '销售额 ÷ 订单数' },
    {
      label: '可售库存',
      value: s && n(s.stockQty) !== null ? `${int(s.stockQty)} 件` : '—',
      tone: 'tone-stock',
      delta: delta(s?.stockDays, p?.stockDays),
      sub: s?.stockDate ? `${String(s.stockDate).slice(5)} 快照 · 可卖 ${s.stockDays ?? '—'} 天` : '暂无库存快照'
    },
    {
      label: '广告花费',
      value: s ? `${money(s.cpcSpent)} ₽` : '—',
      tone: 'tone-cpc',
      delta: delta(s?.cpcSpent, p?.cpcSpent),
      sub: n(s?.drr) === null ? 'ДРР —' : `ДРР ${pct(s.drr)}`
    }
  ];
});

/** 库存表只有近期才有数据，和订单区间对不上时给一句提示，免得以为库存掉了。 */
const stockHint = computed(() => {
  if (!rows.value.length) return '';
  const total = rows.value.length;
  if (stockDays.value >= total) return '';
  if (!stockDays.value) return `提示：这个区间还没有库存快照（库存表从 2026-10-25 开始每天同步），所以「可售库存」一列和库存曲线暂时是空的。`;
  return `提示：库存快照只覆盖了 ${stockDays.value} / ${total} 天（每天 17:00 同步一次），库存曲线只画有快照的那几天。`;
});

/** 明细表按日期倒序，和网页后台「最近一天在最上面」一致。 */
const tableRows = computed(() => [...rows.value].sort((a, b) => String(b.statDate).localeCompare(String(a.statDate))));

/** 后端只返回有成交的日期，图表要补齐区间内的空白天，否则柱子会挤在一起看不出断档。 */
function filledRows(): OzonOrderTrendRow[] {
  if (!dateRange.value || dateRange.value.length !== 2) return rows.value;
  const byDate = new Map(rows.value.map(r => [String(r.statDate).slice(0, 10), r]));
  const out: OzonOrderTrendRow[] = [];
  const start = new Date(dateRange.value[0] + 'T00:00:00');
  const end = new Date(dateRange.value[1] + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toLocaleDateString('sv-SE');
    out.push(byDate.get(key) || {
      statDate: key,
      shopId: null,
      orders: 0,
      units: 0,
      gmv: 0,
      avgOrder: null,
      stockQty: null,
      stockTotalQty: null,
      skuCount: null,
      cpcSpent: 0,
      drr: null,
      returns: 0
    });
  }
  return out;
}

/** 展开行：一天按 SKU 的明细，点开才拉（懒加载，避免一次取 30 天 × 20 SKU）。 */
const skuByDate = ref<Record<string, OzonOrderTrendProduct[]>>({});
const skuLoading = ref<Record<string, boolean>>({});

async function onExpandChange(row: OzonOrderTrendRow, expanded: OzonOrderTrendRow[]) {
  const opened = expanded.some(r => r.statDate === row.statDate);
  if (!opened || skuByDate.value[row.statDate] || skuLoading.value[row.statDate]) return;
  skuLoading.value = { ...skuLoading.value, [row.statDate]: true };
  try {
    const res = await listDailySku(scopeOrderTrendQuery({
      scopeShopId: shopStore.scopedShopId,
      dateFrom: row.statDate,
      dateTo: row.statDate
    }));
    skuByDate.value = { ...skuByDate.value, [row.statDate]: res.data || [] };
  } catch {
    skuByDate.value = { ...skuByDate.value, [row.statDate]: [] };
  } finally {
    skuLoading.value = { ...skuLoading.value, [row.statDate]: false };
  }
}

/** 该单品件数占当天比例。 */
function share(product: OzonOrderTrendProduct, day: OzonOrderTrendRow) {
  const total = n(day.units) ?? 0;
  if (!total) return '—';
  return `${(((n(product.units) ?? 0) / total) * 100).toFixed(1)}%`;
}

/** 当前库存（按商品）：跟日期区间无关，始终是每店最新快照。 */
const stock = ref<OzonStockItem[]>([]);
const stockDate = computed(() => {
  const dates = stock.value.map(s => String(s.statDate || '')).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : '';
});
const stockAvailableTotal = computed(() => stock.value.reduce((sum, s) => sum + (n(s.availableQty) ?? 0), 0));
const stockTotalAll = computed(() => stock.value.reduce((sum, s) => sum + (n(s.totalQty) ?? 0), 0));
const stockChartHeight = computed(() => Math.max(220, stock.value.length * 26 + 70));

let stockByProduct: echarts.ECharts | undefined;
const stockByProductElement = ref<HTMLElement>();

function renderStockByProduct() {
  if (!stockByProductElement.value) return;
  const list = [...stock.value].sort((a, b) => (n(b.totalQty) ?? 0) - (n(a.totalQty) ?? 0)).slice(0, 30);
  if (!stockByProduct) stockByProduct = echarts.init(stockByProductElement.value);
  const short = (v: string) => {
    const t = String(v || '');
    return t.length > 16 ? t.slice(0, 16) + '…' : t;
  };
  stockByProduct.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = params as { dataIndex: number }[];
        if (!arr || !arr.length) return '';
        const r = list[arr[0].dataIndex];
        return `<div style="font-weight:600;margin-bottom:4px">${r.productName || r.sellerSku}</div>`
          + `<div style="color:#888;margin-bottom:4px">${r.sellerSku}</div>`
          + tooltipLine('可售', `${int(r.availableQty)} 件`)
          + tooltipLine('不可售/在途', `${int(r.otherQty)} 件`)
          + tooltipLine('在仓合计', `${int(r.totalQty)} 件`);
      }
    },
    legend: { data: ['可售', '不可售/在途'], top: 0, right: 8, itemWidth: 10, itemHeight: 10 },
    // 右侧留出「合计数」标签的位置，否则最长那根的标签会被裁掉
    grid: { left: 8, right: 64, top: 28, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed' } },
      max: (v: { max: number }) => Math.ceil((v.max || 0) * 1.06)
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: list.map(r => short(r.productName || r.sellerSku)),
      axisTick: { show: false },
      axisLabel: { fontSize: 11 }
    },
    series: [
      {
        name: '可售',
        type: 'bar',
        stack: 'qty',
        barMaxWidth: 16,
        itemStyle: { color: '#5b8ff9' },
        data: list.map(r => n(r.availableQty) ?? 0)
      },
      {
        name: '不可售/在途',
        type: 'bar',
        stack: 'qty',
        barMaxWidth: 16,
        itemStyle: { color: '#dcdfe6', borderRadius: [0, 3, 3, 0] },
        // 合计数直接标在柱子末端（灰色那段可能为 0，标在它身上就是整根的长度）
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: '#5c6672',
          formatter: (p: { dataIndex: number }) => int(list[p.dataIndex]?.totalQty)
        },
        data: list.map(r => n(r.otherQty) ?? 0)
      }
    ]
  }, true);
  stockByProduct.resize();
}

let mainChart: echarts.ECharts | undefined;
let stockChart: echarts.ECharts | undefined;
const mainChartElement = ref<HTMLElement>();
const stockChartElement = ref<HTMLElement>();

const tooltipLine = (label: string, val: string) =>
  `<div style="display:flex;justify-content:space-between;gap:18px"><span>${label}</span><b>${val}</b></div>`;

function renderMainChart() {
  if (!mainChartElement.value) return;
  const list = filledRows();
  if (!mainChart) mainChart = echarts.init(mainChartElement.value);
  // 订单数（几单）与销售额（上万卢布）量级差太大，共轴会把订单柱压成一条线 → 分双轴。
  mainChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { dataIndex: number }[];
        if (!items || !items.length) return '';
        const r = list[items[0].dataIndex];
        return `<div style="font-weight:600;margin-bottom:4px">${r.statDate}</div>`
          + tooltipLine('订单数', int(r.orders))
          + tooltipLine('销售额', `${money(r.gmv)} ₽`)
          + tooltipLine('售出件数', int(r.units))
          + tooltipLine('客单价', `${money(r.avgOrder)} ₽`)
          + tooltipLine('广告花费', `${money(r.cpcSpent)} ₽`);
      }
    },
    legend: { data: ['订单数', '销售额 ₽'], top: 0, right: 8, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: list.map(r => String(r.statDate).slice(5)), axisTick: { show: false } },
    yAxis: [
      { type: 'value', name: '', splitLine: { lineStyle: { type: 'dashed' } } },
      { type: 'value', name: '', splitLine: { show: false } }
    ],
    series: [
      {
        name: '订单数',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 22,
        itemStyle: { color: '#5b8ff9', borderRadius: [3, 3, 0, 0] },
        data: list.map(r => n(r.orders) ?? 0)
      },
      {
        name: '销售额 ₽',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2 },
        itemStyle: { color: '#f2a15a' },
        areaStyle: { opacity: 0.08 },
        data: list.map(r => n(r.gmv) ?? 0)
      }
    ]
  }, true);
  mainChart.resize();
}

function renderStockChart() {
  if (!stockChartElement.value) return;
  const list = filledRows();
  if (!stockChart) stockChart = echarts.init(stockChartElement.value);
  // 库存是存量（几千件）、售出是流量（几十件）→ 双轴；没快照的日子留 null，曲线自然断开。
  stockChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { dataIndex: number }[];
        if (!items || !items.length) return '';
        const r = list[items[0].dataIndex];
        const stock = n(r.stockQty) === null ? '—' : `${int(r.stockQty)} 件`;
        const total = n(r.stockTotalQty) === null ? '—' : `${int(r.stockTotalQty)} 件`;
        return `<div style="font-weight:600;margin-bottom:4px">${r.statDate}</div>`
          + tooltipLine('可售库存', stock)
          + tooltipLine('在仓+在途', total)
          + tooltipLine('售出件数', int(r.units))
          + tooltipLine('退货件数', int(r.returns));
      }
    },
    legend: { data: ['可售库存', '售出件数'], top: 0, right: 8, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: list.map(r => String(r.statDate).slice(5)), axisTick: { show: false } },
    yAxis: [
      { type: 'value', name: '', splitLine: { lineStyle: { type: 'dashed' } } },
      { type: 'value', name: '', splitLine: { show: false } }
    ],
    series: [
      {
        name: '可售库存',
        type: 'line',
        yAxisIndex: 0,
        smooth: false,
        symbolSize: 5,
        connectNulls: false,
        itemStyle: { color: '#5ad8a6' },
        areaStyle: { opacity: 0.16 },
        data: list.map(r => n(r.stockQty))
      },
      {
        name: '售出件数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2, type: 'dashed' },
        itemStyle: { color: '#5b8ff9' },
        data: list.map(r => n(r.units) ?? 0)
      }
    ]
  }, true);
  stockChart.resize();
}

function renderCharts() {
  renderMainChart();
  renderStockChart();
  renderStockByProduct();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const stockPromise = getStock(scopeOrderTrendQuery({ scopeShopId: shopStore.scopedShopId }))
      .then(r2 => { stock.value = r2.data || []; })
      .catch(() => { stock.value = []; });
    const res = await getOrderTrend(scopeOrderTrendQuery({
      scopeShopId: shopStore.scopedShopId,
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
      topN: 10
    }));
    const data = res.data;
    summary.value = data?.summary || null;
    prev.value = data?.prev || null;
    rows.value = data?.rows || [];
    topProducts.value = data?.topProducts || [];
    stockDays.value = data?.stockDays || 0;
    skuByDate.value = {};
    skuLoading.value = {};
    await stockPromise;
    await nextTick();
    renderCharts();   // 里面已包含 renderStockByProduct()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '订单趋势加载失败';
  } finally {
    loading.value = false;
  }
}

function applyQuick(v: string) {
  if (v === 'month') {
    // 本月 1 号 ~ 昨天
    dateRange.value = [mskDate(-1).slice(0, 8) + '01', mskDate(-1)];
  } else {
    const days = Number(v) || 14;
    // 只到昨天：今天还没结束，取进来只会是个偏小的半天数
    dateRange.value = [mskDate(-days), mskDate(-1)];
  }
  load();
}

/** 合计行：库存是存量不能相加，取最后一天（表格已按日期倒序，第一行就是最新）。 */
function summaryMethod({ columns, data }: { columns: { property?: string }[]; data: OzonOrderTrendRow[] }) {
  const latest = data[0];
  return columns.map((col) => {
    const prop = col.property;
    if (!prop) return '';
    if (prop === 'statDate') return '合计';
    if (prop === 'stockQty') return latest?.stockQty === null || latest?.stockQty === undefined ? '—' : int(latest.stockQty);
    if (prop === 'stockTotalQty') return latest?.stockTotalQty === null || latest?.stockTotalQty === undefined ? '—' : int(latest.stockTotalQty);
    if (prop === 'avgOrder' || prop === 'drr') {
      const numerator = data.reduce((sum, r) => sum + (n(prop === 'drr' ? r.cpcSpent : r.gmv) ?? 0), 0);
      const denominator = data.reduce((sum, r) => sum + (n(prop === 'drr' ? r.gmv : r.orders) ?? 0), 0);
      if (!denominator) return '—';
      const value = (numerator / denominator) * (prop === 'drr' ? 100 : 1);
      return prop === 'drr' ? pct(value) : money(value);
    }
    const sum = data.reduce((acc, r) => acc + (n((r as unknown as Record<string, Num>)[prop]) ?? 0), 0);
    return ['gmv', 'cpcSpent'].includes(prop) ? money(sum) : int(sum);
  });
}

/** 全局店铺切换（首页）后本页跟着重查。 */
watch(() => shopStore.selectedId, () => load());
watch(quick, (v) => applyQuick(v));

function onResize() {
  mainChart?.resize();
  stockChart?.resize();
  stockByProduct?.resize();
}

onMounted(async () => {
  try {
    await shopStore.loadShops();
  } catch { /* 店铺列表失败不阻塞页面，按「全部店铺」显示 */ }
  await load();
  window.addEventListener('resize', onResize);
});

onActivated(() => {
  nextTick(() => {
    mainChart?.resize();
    stockChart?.resize();
    stockByProduct?.resize();
  });
});
onDeactivated(() => {
  mainChart?.dispose();
  stockChart?.dispose();
  stockByProduct?.dispose();
  mainChart = undefined;
  stockChart = undefined;
  stockByProduct = undefined;
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  mainChart?.dispose();
  stockChart?.dispose();
  stockByProduct?.dispose();
  mainChart = undefined;
  stockChart = undefined;
  stockByProduct = undefined;
});
</script>

<style scoped>
.order-trend-page { --trend-border: var(--el-border-color-lighter); }
.trend-card :deep(.el-card__header) { padding: 8px 12px; }
.trend-card :deep(.el-card__body) { padding: 8px 12px 12px; }
.table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.view-controls, .view-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-color-primary); }
.view-refreshing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-primary); animation: trend-blink 1s infinite; }
@keyframes trend-blink { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
.description { margin: 2px 0 6px; font-size: 12px; line-height: 20px; color: var(--el-text-color-secondary); }
.description code { background: var(--el-fill-color-light); padding: 0 4px; border-radius: 4px; }
.hint { margin: 0 0 8px; font-size: 12px; line-height: 18px; color: #a85400; background: #fff8e6; border: 1px solid #ffe4b3; border-radius: 6px; padding: 5px 8px; }
.notice { margin-bottom: 10px; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-bottom: 4px; }
.kpi { border: 1px solid var(--trend-border); border-radius: 8px; padding: 8px 10px; background: var(--el-fill-color-lighter); }
.kpi-label { font-size: 12px; color: var(--el-text-color-secondary); }
.kpi-value { font-size: 19px; font-weight: 600; line-height: 27px; color: #1f2329; font-variant-numeric: tabular-nums; }
.kpi-value.tone-orders { color: #245bdb; }
.kpi-value.tone-gmv { color: #b45309; }
.kpi-value.tone-stock { color: #237b19; }
.kpi-value.tone-cpc { color: #8a5300; }
.kpi-foot { display: flex; align-items: center; gap: 6px; font-size: 11px; line-height: 16px; }
.delta { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--el-text-color-secondary); }
.delta.up { color: #c02b2b; }
.delta.down { color: #237b19; }
.kpi-sub { color: var(--el-text-color-placeholder); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.section-title { margin: 14px 0 6px; font-size: 13px; font-weight: 600; color: #1f2329; }
.main-chart { width: 100%; height: 300px; }
.duo { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.duo-main, .duo-side { min-width: 0; }
.stock-chart { width: 100%; height: 240px; }
.stock-by-product { width: 100%; min-height: 220px; }
.section-sub { margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--el-text-color-secondary); }
.chart-empty { padding: 8px 0; font-size: 12px; color: var(--el-text-color-placeholder); text-align: center; }
.trend-grid { width: 100%; }
.expand-wrap { padding: 4px 12px 10px 12px; background: var(--el-fill-color-lighter); }
.expand-loading { padding: 6px 0; font-size: 12px; color: var(--el-text-color-secondary); }
.sku-grid :deep(.el-table__cell) { padding: 1px 0; }
.top-grid { width: 100%; }
.product-cell { display: flex; flex-direction: column; line-height: 16px; min-width: 0; }
.product-name { font-size: 12px; color: #1f2329; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.product-sku { font-size: 11px; color: var(--el-text-color-placeholder); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 1180px) {
  .duo { grid-template-columns: minmax(0, 1fr); }
}
:global(html.dark) .kpi-value { color: var(--el-text-color-primary); }
:global(html.dark) .section-title { color: var(--el-text-color-primary); }
:global(html.dark) .product-name { color: var(--el-text-color-primary); }
</style>
