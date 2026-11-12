<template>
  <div class="p-2 app-container ops-page">
    <div class="ops-layout">
      <!-- 左：日期列表 -->
      <aside class="ops-side">
        <div class="side-head">
          <span class="side-title">运营情况</span>
          <span class="side-count">{{ rows.length }} 天</span>
          <span v-if="loading" class="view-refreshing" role="status"><i class="view-refreshing-dot" />加载中</span>
        </div>
        <el-scrollbar v-loading="loading && !rows.length" class="side-scroll">
          <div
            v-for="r in rows"
            :key="r.id"
            class="day-item"
            :class="{ active: r.id === currentId }"
            role="button"
            tabindex="0"
            @click="select(r)"
            @keyup.enter="select(r)"
          >
            <div class="day-line">
              <span class="day-date">{{ dayText(r.statDate) }}</span>
              <span class="day-delta" :class="deltaTone(r)">{{ deltaText(r) }}</span>
            </div>
            <div class="day-title" :title="r.title">{{ r.title || '（无标题）' }}</div>
            <div class="day-meta">
              <span>{{ int(r.orders) }} 单</span>
              <span class="dot">·</span>
              <span>{{ money(r.revenue) }} ₽</span>
              <span v-if="(r.riskCount || 0) > 0" class="risk-flag">{{ r.riskCount }} 项风险</span>
            </div>
          </div>
          <el-empty v-if="!loading && !rows.length" description="还没有简报" :image-size="48" />
        </el-scrollbar>
      </aside>

      <!-- 右：当天简报 -->
      <section class="ops-main">
        <el-card shadow="never" class="ops-card">
          <template #header>
            <div class="main-head">
              <div class="main-title">
                <span class="stat-date">{{ current?.statDate || '—' }}</span>
                <span class="stat-title">{{ current?.title || '' }}</span>
              </div>
              <div class="main-actions">
                <el-button size="small" :disabled="!current?.contentMd" @click="rawVisible = true">原文</el-button>
                <el-button size="small" :loading="loading" icon="Refresh" @click="reload">刷新</el-button>
              </div>
            </div>
          </template>

          <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" class="notice" />

          <template v-else-if="current">
            <div class="kpis">
              <div v-for="k in kpis" :key="k.label" class="kpi">
                <div class="kpi-label">{{ k.label }}</div>
                <div class="kpi-value" :class="k.tone">{{ k.value }}</div>
              </div>
            </div>

            <div v-if="digest" class="digest">{{ digest }}</div>

            <div v-loading="detailLoading" class="brief">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-if="detail?.contentHtml" class="brief-body" v-html="detail.contentHtml" />
              <el-empty v-else-if="!detailLoading" description="这一天还没有简报正文" :image-size="56" />
            </div>
          </template>

          <el-empty v-else description="请选择左侧的日期" :image-size="64" />
        </el-card>
      </section>
    </div>

    <el-dialog v-model="rawVisible" title="简报原文（Markdown）" width="820px" append-to-body>
      <pre class="raw-md">{{ current?.contentMd || '' }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="OzonOps">
import { computed, onMounted, ref } from 'vue';
import { getOpsDetail, listOpsDaily } from '@/api/ozon/ops';
import type { OzonOpsDaily, OzonOpsDetail } from '@/api/ozon/ops/types';

const loading = ref(false);
const detailLoading = ref(false);
const error = ref('');
const rows = ref<OzonOpsDaily[]>([]);
const currentId = ref<number | null>(null);
const detail = ref<OzonOpsDetail | null>(null);
const rawVisible = ref(false);

const current = computed<OzonOpsDaily | null>(() => rows.value.find(r => r.id === currentId.value) || null);
const digest = computed(() => current.value?.digest || '');

const nf0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const int = (v: number | null | undefined) => (num(v) === null ? '—' : nf0.format(num(v) as number));
const money = (v: number | null | undefined) => (num(v) === null ? '—' : nf2.format(num(v) as number));
const one = (v: number | null | undefined) => (num(v) === null ? '—' : nf1.format(num(v) as number));

/** 2026-11-11 → 11-11 周三 */
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function dayText(d: string) {
  if (!d) return '—';
  const date = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return `${String(d).slice(5, 10)} ${WEEK[date.getDay()]}`;
}

/** 环比前一日订单数。 */
function deltaValue(r: OzonOpsDaily): number | null {
  const prev = num(r.ordersPrev);
  const cur = num(r.orders);
  if (prev === null || cur === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}
function deltaText(r: OzonOpsDaily) {
  const v = deltaValue(r);
  if (v === null) return '—';
  return `${v >= 0 ? '+' : ''}${one(v)}%`;
}
function deltaTone(r: OzonOpsDaily) {
  const v = deltaValue(r);
  if (v === null) return '';
  return v > 5 ? 'up' : v < -5 ? 'down' : '';
}

const kpis = computed(() => {
  const c = current.value;
  if (!c) return [];
  const d = deltaValue(c);
  return [
    { label: '订单', value: int(c.orders), tone: '' },
    { label: '销售额 ₽', value: money(c.revenue), tone: 'tone-amount' },
    { label: '环比订单', value: d === null ? '—' : `${d >= 0 ? '+' : ''}${one(d)}%`, tone: deltaTone(c) },
    { label: '客单价 ₽', value: money(c.aov), tone: '' },
    { label: '取消单', value: int(c.cancelled), tone: (c.cancelled || 0) > 10 ? 'warn' : '' },
    { label: '调价 SKU', value: int(c.priceChanges), tone: (c.priceChanges || 0) > 0 ? 'warn' : '' },
    { label: '广告花费 ₽', value: money(c.adSpent), tone: '' },
    { label: '风险', value: int(c.riskCount), tone: (c.riskCount || 0) > 0 ? 'bad' : '' }
  ];
});

async function loadDetail(id: number) {
  detailLoading.value = true;
  detail.value = null;
  try {
    const res = await getOpsDetail(id);
    detail.value = res.data || null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '简报正文加载失败';
  } finally {
    detailLoading.value = false;
  }
}

async function select(row: OzonOpsDaily) {
  if (currentId.value === row.id) return;
  currentId.value = row.id;
  await loadDetail(row.id);
}

async function loadList() {
  loading.value = true;
  error.value = '';
  try {
    const res = await listOpsDaily({ limit: 60 });
    rows.value = res.data || [];
    if (rows.value.length) {
      currentId.value = rows.value[0].id;
      await loadDetail(rows.value[0].id);
    } else {
      currentId.value = null;
      detail.value = null;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '简报列表加载失败';
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await loadList();
}

onMounted(loadList);
</script>

<style scoped>
.ops-page { --ops-border: var(--el-border-color-lighter); height: 100%; }
.ops-layout { display: flex; gap: 10px; align-items: stretch; min-height: calc(100vh - 110px); }
.ops-side {
  width: 268px;
  flex: 0 0 268px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ops-border);
  border-radius: 8px;
  background: var(--el-bg-color);
  overflow: hidden;
}
.side-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--ops-border); }
.side-title { font-size: 13px; font-weight: 600; color: #1f2329; }
.side-count { font-size: 12px; color: var(--el-text-color-secondary); }
.view-refreshing { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-color-primary); margin-left: auto; }
.view-refreshing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--el-color-primary); animation: ops-blink 1s infinite; }
@keyframes ops-blink { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
.side-scroll { flex: 1; min-height: 0; }

.day-item { padding: 7px 10px; border-bottom: 1px solid var(--el-fill-color-lighter); cursor: pointer; border-left: 3px solid transparent; }
.day-item:hover { background: var(--el-fill-color-light); }
.day-item.active { background: var(--el-color-primary-light-9); border-left-color: var(--el-color-primary); }
.day-line { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.day-date { font-size: 13px; font-weight: 600; color: #1f2329; font-variant-numeric: tabular-nums; }
.day-delta { font-size: 12px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.day-delta.up { color: #c02b2b; }
.day-delta.down { color: #237b19; }
.day-title { margin-top: 2px; font-size: 12px; color: var(--el-text-color-regular); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.day-meta { margin-top: 2px; display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
.day-meta .dot { color: var(--el-text-color-placeholder); }
.risk-flag { margin-left: auto; color: #b45309; }

.ops-main { flex: 1; min-width: 0; }
.ops-card :deep(.el-card__header) { padding: 8px 12px; }
.ops-card :deep(.el-card__body) { padding: 8px 12px 14px; }
.main-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.main-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.stat-date { font-size: 14px; font-weight: 600; color: #1f2329; font-variant-numeric: tabular-nums; }
.stat-title { font-size: 13px; color: var(--el-text-color-regular); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.main-actions { display: flex; gap: 8px; flex: none; }
.notice { margin-bottom: 10px; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.kpi { border: 1px solid var(--ops-border); border-radius: 8px; padding: 6px 10px; background: var(--el-fill-color-lighter); }
.kpi-label { font-size: 12px; color: var(--el-text-color-secondary); }
.kpi-value { font-size: 18px; font-weight: 600; line-height: 26px; color: #1f2329; font-variant-numeric: tabular-nums; }
.kpi-value.tone-amount { color: #245bdb; }
.kpi-value.up { color: #c02b2b; }
.kpi-value.down { color: #237b19; }
.kpi-value.warn { color: #a85400; }
.kpi-value.bad { color: #c02b2b; }

.digest { margin: 10px 0 2px; padding: 8px 10px; border-radius: 6px; background: var(--el-fill-color-light); font-size: 13px; line-height: 21px; color: var(--el-text-color-regular); }
.brief { margin-top: 6px; }

/* ---- 简报正文（后端 markdown 预渲染） ---- */
.brief-body { font-size: 13px; line-height: 21px; color: var(--el-text-color-regular); }
.brief-body :deep(h1) { font-size: 17px; margin: 14px 0 6px; color: #1f2329; }
.brief-body :deep(h2) { font-size: 15px; margin: 16px 0 6px; padding-left: 8px; border-left: 3px solid var(--el-color-primary); color: #1f2329; }
.brief-body :deep(h3) { font-size: 13px; margin: 12px 0 4px; color: #1f2329; }
.brief-body :deep(p) { margin: 4px 0; }
.brief-body :deep(ul) { margin: 4px 0; padding-left: 20px; }
.brief-body :deep(li) { margin: 2px 0; }
.brief-body :deep(strong) { color: #1f2329; }
.brief-body :deep(code) { padding: 0 4px; border-radius: 4px; background: var(--el-fill-color-light); font-size: 12px; }
.brief-body :deep(blockquote) { margin: 6px 0; padding: 6px 10px; border-left: 3px solid var(--el-border-color); background: var(--el-fill-color-lighter); color: var(--el-text-color-secondary); }
.brief-body :deep(table) { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 12px; }
.brief-body :deep(th),
.brief-body :deep(td) { border: 1px solid var(--ops-border); padding: 4px 8px; text-align: left; }
.brief-body :deep(th) { background: var(--el-fill-color-light); font-weight: 600; color: #1f2329; }
.brief-body :deep(td) { font-variant-numeric: tabular-nums; }
.brief-body :deep(hr) { border: none; border-top: 1px solid var(--ops-border); margin: 10px 0; }

.raw-md { max-height: 60vh; overflow: auto; margin: 0; padding: 10px; background: var(--el-fill-color-lighter); border-radius: 6px; font-size: 12px; line-height: 19px; white-space: pre-wrap; word-break: break-word; }

:global(html.dark) .side-title,
:global(html.dark) .kpi-value,
:global(html.dark) .day-date,
:global(html.dark) .stat-date { color: var(--el-text-color-primary); }
</style>
