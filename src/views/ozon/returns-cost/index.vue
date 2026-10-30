<template>
  <div class="p-2 app-container cost-page">
    <el-card shadow="never" class="report-card">
      <template #header>
        <div class="table-toolbar">
          <div class="view-controls">
            <el-tag v-if="shopStore.selectedName" type="primary" size="small">{{ shopStore.selectedName }}</el-tag>
            <span class="record-count">
              共 {{ amount(summary.shipmentCount) }} 单 · {{ amount(summary.returnQty) }} 件 · 应计退货费用
              {{ money(summary.costTotalRub) }} ₽
            </span>
            <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot"></i>数据更新中</span>
          </div>
          <div class="view-actions">
            <el-select v-model="status" placeholder="全部状态" class="status-select" aria-label="退货状态" @change="reload">
              <el-option label="全部状态" value="" />
              <el-option v-for="option in STATUS_OPTIONS" :key="option" :label="option" :value="option" />
            </el-select>
            <el-select v-model="month" placeholder="全部月份" class="month-select" aria-label="退货月份" @change="reload">
              <el-option label="全部月份" value="" />
              <el-option v-for="item in monthOptions" :key="item" :label="item" :value="item" />
            </el-select>
            <el-button :loading="loading" icon="Refresh" @click="load">刷新</el-button>
          </div>
        </div>
      </template>

      <p class="description">
        一行 = 一张退货单。退货侧取自 Ozon 退货报告（<b>只含仓储费 / 销毁费</b>）；成本侧取自应计费用的三个退货科目：
        逆向物流、合作伙伴处理退货、自提点退货受理。应计没有货件号，只能按「<b>卖家货号 + 订单日期</b>」分组后
        <b>均摊</b>到该组退货单上，所以单行成本是组内平均值、不是 Ozon 逐单回传值；组内没有退货单的应计（如订单日期为空）计入「未分摊」，只在汇总里体现、不落到单行。
        某单所在的「货号 + 订单日」分组若查不到应计，该单成本显示 0（多为已完结退货或尚未出账）。
        月份筛选：退货按退货日期归月，应计按出账日期归月。
      </p>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />

      <div class="kpi-row">
        <div class="kpi">
          <span class="kpi-label">退货单数</span>
          <b class="kpi-value">{{ amount(summary.shipmentCount) }}</b>
          <span class="kpi-sub">{{ amount(summary.returnQty) }} 件</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">退货货值</span>
          <b class="kpi-value">{{ money(summary.goodsValueRub) }}</b>
          <span class="kpi-sub">₽ · 报告仓储费 {{ money(summary.storageFeeRub) }} ₽</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">应计退货费用</span>
          <b class="kpi-value cost">{{ money(summary.costTotalRub) }}</b>
          <span class="kpi-sub">₽ · 逆向物流 {{ money(summary.reverseLogisticsRub) }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">单均成本</span>
          <b class="kpi-value cost">{{ money(summary.costPerShipmentRub) }}</b>
          <span class="kpi-sub">₽ / 单 · 处理费 {{ money(summary.handlingFeeRub) }} ₽</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">费用率</span>
          <b class="kpi-value">{{ money(summary.costRatePct) }}%</b>
          <span class="kpi-sub">成本 / 货值</span>
        </div>
      </div>

      <p v-if="unmappedCost > 0" class="unmapped">
        另有 <b>{{ amount(summary.unmappedCount) }}</b> 笔、合计 <b>{{ money(summary.unmappedCostRub) }}</b> ₽ 的应计退货费用找不到对应退货单
        （应计里缺订单日期，或该组退货已完结不在报告里）。上方「应计退货费用 / 单均成本」已包含这部分，只是无法落到具体单行，明细里不体现。
      </p>

      <el-empty v-if="!loading && !rows.length" description="没有符合条件的退货记录" />

      <template v-else>
        <div class="section-title">按货号汇总</div>
        <el-table :data="articles" size="small" border class="article-table" max-height="260">
          <el-table-column label="产品" min-width="220">
            <template #default="{ row }">
              <div class="cell-product">
                <img v-if="imageUrl(row)" class="thumb" :src="imageUrl(row)" alt="货品图片" />
                <div class="cell-ident">
                  <div class="cell-name">{{ row.productName || row.articleNo || '未命名产品' }}</div>
                  <div class="cell-sub">货号：{{ row.articleNo || '—' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="shipmentCount" label="退货单" width="90" align="right" />
          <el-table-column prop="returnQty" label="件数" width="80" align="right" />
          <el-table-column label="逆向物流(₽)" width="120" align="right">
            <template #default="{ row }">{{ money(row.reverseLogisticsRub) }}</template>
          </el-table-column>
          <el-table-column label="处理费(₽)" width="110" align="right">
            <template #default="{ row }">{{ money(row.handlingFeeRub) }}</template>
          </el-table-column>
          <el-table-column label="自提点(₽)" width="110" align="right">
            <template #default="{ row }">{{ money(row.pickupFeeRub) }}</template>
          </el-table-column>
          <el-table-column label="成本合计(₽)" width="120" align="right">
            <template #default="{ row }"><b class="cost">{{ money(row.costTotalRub) }}</b></template>
          </el-table-column>
          <el-table-column label="单均(₽)" width="100" align="right">
            <template #default="{ row }">{{ money(row.costPerShipmentRub) }}</template>
          </el-table-column>
        </el-table>

        <div class="section-title">退货明细（成本按「货号 + 订单日」均摊）</div>
        <el-table
          :data="pageRows"
          size="small"
          border
          height="480"
          :empty-text="loading ? '加载中…' : '没有符合条件的退货明细'"
          @sort-change="onSortChange"
        >
          <el-table-column type="index" label="#" width="46" align="center" :index="rowIndex" />
          <el-table-column label="产品" min-width="210" sortable="custom" prop="productName">
            <template #default="{ row }">
              <div class="cell-product">
                <img v-if="imageUrl(row)" class="thumb" :src="imageUrl(row)" alt="货品图片" />
                <div class="cell-ident">
                  <div class="cell-name">{{ row.productName || '—' }}</div>
                  <div class="cell-sub">{{ row.articleNo || '—' }} · SKU {{ row.sku || '—' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="shopName" label="店铺" width="120" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="shipmentNo" label="货件编号" width="150" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="returnStatus" label="状态" width="118" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="returnDate" label="退货日期" width="150" sortable="custom" />
          <el-table-column prop="returnQty" label="件数" width="70" align="right" sortable="custom" />
          <el-table-column prop="storageDays" label="仓储天" width="84" align="right" sortable="custom" />
          <el-table-column prop="storageFeeRub" label="仓储费(₽)" width="100" align="right" sortable="custom">
            <template #default="{ row }">{{ money(row.storageFeeRub) }}</template>
          </el-table-column>
          <el-table-column prop="reverseLogisticsRub" label="逆向物流(₽)" width="120" align="right" sortable="custom">
            <template #default="{ row }">{{ money(row.reverseLogisticsRub) }}</template>
          </el-table-column>
          <el-table-column prop="handlingFeeRub" label="处理费(₽)" width="104" align="right" sortable="custom">
            <template #default="{ row }">{{ money(row.handlingFeeRub) }}</template>
          </el-table-column>
          <el-table-column prop="pickupFeeRub" label="自提点(₽)" width="100" align="right" sortable="custom">
            <template #default="{ row }">{{ money(row.pickupFeeRub) }}</template>
          </el-table-column>
          <el-table-column prop="costTotalRub" label="成本合计(₽)" width="118" align="right" sortable="custom">
            <template #default="{ row }"><b class="cost">{{ money(row.costTotalRub) }}</b></template>
          </el-table-column>
        </el-table>

        <div class="table-foot">
          <span class="record-count">
            本页成本 {{ money(pageCost) }} ₽ · 全部明细成本 {{ money(rowsCost) }} ₽ · 应计总额
            {{ money(totalAccrualCost) }} ₽（含未分摊 {{ money(summary.unmappedCostRub) }} ₽）
          </span>
          <el-pagination
            v-model:current-page="page"
            :page-size="PAGE_SIZE"
            :total="rows.length"
            layout="prev, pager, next, jumper"
            background
            size="small"
          />
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="OzonReturnsCost">
import { computed, onActivated, onMounted, ref } from 'vue';
import { listReturnsCost, scopeReportQuery } from '@/api/ozon/report';
import type { OzonReturnsCostVO, ReportQuery } from '@/api/ozon/report/types';
import { useOzonShopStore } from '@/store/modules/ozonShop';

/** 退货状态取值，与「2.退货」「2.1 退货图表」一致。 */
const STATUS_OPTIONS = ['被处理', '在 Ozon 仓库里', '销毁中', '正在寻找商品', '正在运往Ozon仓库', '我们已核销商品', '正在运送给您', '等待发货'];
/** 明细排序口径：金额/件数为数值，日期与编号为文本（日期文本即时间序）。 */
const SORT_KIND: Record<string, 'number' | 'text'> = {
  productName: 'text',
  shopName: 'text',
  shipmentNo: 'text',
  returnStatus: 'text',
  returnDate: 'text',
  returnQty: 'number',
  storageDays: 'number',
  storageFeeRub: 'number',
  reverseLogisticsRub: 'number',
  handlingFeeRub: 'number',
  pickupFeeRub: 'number',
  costTotalRub: 'number'
};
const PAGE_SIZE = 20;

const shopStore = useOzonShopStore();
const costData = ref<OzonReturnsCostVO>();
const loading = ref(false);
const error = ref('');
const status = ref('');
const month = ref('');
const page = ref(1);
const sortProp = ref('');
const sortOrder = ref<'ascending' | 'descending' | ''>('');
let requestVersion = 0;
let disposed = false;

const rows = computed(() => costData.value?.rows ?? []);
const articles = computed(() => costData.value?.articles ?? []);
const summary = computed(() => costData.value?.summary ?? ({} as OzonReturnsCostVO['summary']));
/** 月份下拉：从明细里取「退货日期」的月份去重倒序，避免额外接口。 */
const monthOptions = computed(() => {
  const set = new Set<string>();
  rows.value.forEach(row => {
    if (row.returnDate) set.add(String(row.returnDate).slice(0, 7));
  });
  return Array.from(set).sort().reverse();
});
const unmappedCost = computed(() => num(summary.value.unmappedCostRub));
/** 排序后的整份明细（排序作用于全部行，不只当前页）。 */
const sortedRows = computed(() => {
  const prop = sortProp.value;
  if (!prop) return rows.value;
  const kind = SORT_KIND[prop] ?? 'text';
  const direction = sortOrder.value === 'descending' ? -1 : 1;
  return rows.value
    .map(row => ({ row, key: sortKey(row, prop, kind) }))
    .sort((left, right) => {
      if (left.key === null || right.key === null) {
        if (left.key === null && right.key === null) return 0;
        return left.key === null ? 1 : -1;
      }
      const diff = kind === 'text' ? String(left.key).localeCompare(String(right.key), 'zh-Hans-CN') : Number(left.key) - Number(right.key);
      return diff * direction;
    })
    .map(entry => entry.row);
});
const pageRows = computed(() => sortedRows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const rowsCost = computed(() => rows.value.reduce((sum, row) => sum + num(row.costTotalRub), 0));
const pageCost = computed(() => pageRows.value.reduce((sum, row) => sum + num(row.costTotalRub), 0));
const totalAccrualCost = computed(() => rowsCost.value + unmappedCost.value);

function num(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function amount(value: number | string | null | undefined) {
  return num(value).toLocaleString('zh-CN');
}
function money(value: number | string | null | undefined) {
  return num(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function imageUrl(row: { imageUrl?: string | null }) {
  return row.imageUrl || '';
}
function rowIndex(index: number) {
  return (page.value - 1) * PAGE_SIZE + index + 1;
}
function sortKey(row: Record<string, any>, prop: string, kind: 'number' | 'text') {
  const value = row[prop];
  if (value === null || value === undefined || value === '') return kind === 'number' ? 0 : null;
  return kind === 'number' ? num(value) : String(value);
}
function onSortChange({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }) {
  sortProp.value = order ? prop : '';
  sortOrder.value = order ?? '';
  page.value = 1;
}
function reload() {
  page.value = 1;
  sortProp.value = '';
  sortOrder.value = '';
  void load();
}

async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = '';
  try {
    await shopStore.ensureLoaded().catch(() => {});
    const query: ReportQuery = {};
    if (status.value) query.status = status.value;
    if (month.value) query.month = month.value;
    const result = await listReturnsCost(scopeReportQuery(query, shopStore.selectedId));
    if (version !== requestVersion || disposed) return;
    costData.value = result.data;
    const maxPage = Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE));
    if (page.value > maxPage) page.value = maxPage;
  } catch {
    if (version === requestVersion && !disposed) {
      error.value = '退货成本查询失败，请点击刷新重试。';
      costData.value = undefined;
    }
  } finally {
    if (version === requestVersion && !disposed) loading.value = false;
  }
}

onMounted(() => {
  disposed = false;
  void load();
});
onActivated(() => {
  if (!costData.value) void load();
});
</script>

<style scoped lang="scss">
.cost-page { background: var(--el-bg-color-page); }
.report-card :deep(.el-card__header) { padding: 10px 14px; }
.table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.view-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.view-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.status-select { width: 168px; }
.month-select { width: 132px; }
.record-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.description { font-size: 12px; line-height: 1.7; color: var(--el-text-color-secondary); margin: 8px 0 12px; }
.notice { margin-bottom: 10px; }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 20px; padding: 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; background: var(--el-bg-color-overlay); color: var(--el-text-color-secondary); font-size: 12px; line-height: 1; white-space: nowrap; }
.view-refreshing-dot { display: inline-block; width: 9px; height: 9px; border: 1.5px solid var(--el-color-primary); border-top-color: transparent; border-radius: 50%; animation: view-refreshing-spin .7s linear infinite; }
@keyframes view-refreshing-spin { to { transform: rotate(360deg); } }

.kpi-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
@media (max-width: 1100px) { .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.kpi { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-blank); }
.kpi-label { font-size: 12px; color: var(--el-text-color-secondary); }
.kpi-value { font-size: 21px; line-height: 1.25; color: var(--el-text-color-primary); }
.kpi-value.cost { color: var(--el-color-danger); }
.kpi-sub { font-size: 12px; color: var(--el-text-color-secondary); }

.unmapped { margin: 0 0 10px; padding: 8px 10px; border-left: 3px solid var(--el-color-warning); background: var(--el-color-warning-light-9); border-radius: 4px; font-size: 12px; line-height: 1.6; color: var(--el-text-color-regular); }
.section-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); margin: 6px 0 8px; }
.article-table { margin-bottom: 14px; }
.cell-product { display: flex; align-items: center; gap: 8px; min-width: 0; }
.thumb { width: 34px; height: 34px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; object-fit: contain; flex: none; background: var(--el-fill-color-lighter); }
.cell-ident { min-width: 0; }
.cell-name { font-size: 13px; color: var(--el-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-sub { margin-top: 1px; font-size: 11px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cost { color: var(--el-color-danger); }
.table-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
</style>
