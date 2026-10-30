<template>
  <div class="format-panel">
    <p class="format-title">
      <span class="format-name">{{ column?.label || '字段' }}</span>
      <span class="format-kind">{{ kindText }}</span>
    </p>

    <div v-if="formula" class="format-formula">
      <div class="format-formula-head"><span class="fx">ƒx</span>公式（由数据库视图计算，只读）</div>
      <code class="format-formula-body">{{ formula }}</code>
    </div>

    <el-radio-group v-if="kind === 'date'" class="format-options" :model-value="dateMode" @change="setDate">
      <el-radio value="datetime">年月日 时分秒<em>2026-10-07 14:30:00</em></el-radio>
      <el-radio value="date">只显示年月日<em>2026-10-07</em></el-radio>
    </el-radio-group>

    <el-radio-group v-else-if="kind === 'number'" class="format-options" :model-value="digits" @change="setDigits">
      <el-radio v-for="option in digitOptions" :key="option.value" :value="option.value">
        {{ option.label }}<em>{{ option.sample }}</em>
      </el-radio>
    </el-radio-group>

    <p v-else class="format-hint">文本字段没有可选的显示格式。</p>

    <div v-if="kind !== 'text' && hasFormat" class="format-footer">
      <el-button link type="primary" size="small" @click="reset">恢复默认</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { columnFormatKind, type ColumnFormat, type ReportColumn } from './columns';

// 表头点击后弹出的列格式面板：只改「怎么显示」，不动数据、筛选、排序与汇总。
const props = defineProps<{ column: ReportColumn | null; modelValue?: ColumnFormat; formula?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: ColumnFormat | undefined] }>();

const kind = computed(() => (props.column ? columnFormatKind(props.column) : 'text'));
const kindText = computed(() => {
  const base = ({ date: '日期字段', number: '数字字段', text: '文本字段' } as Record<string, string>)[kind.value];
  return props.column?.readonly ? `计算列 · ${base}` : base;
});
const hasFormat = computed(() => {
  const format = props.modelValue;
  return !!(format && (format.date !== undefined || format.digits !== undefined));
});

/**
 * ⚠️ 未设置过时**不预选**任何一项 —— 日期列没设格式时是「按数据原样显示」，
 * 而原样并不等于这两个选项里的任何一个。若这里默认选中「年月日 时分秒」，
 * 用户点它时值没变化 → change 不触发 → 看起来"选了却没生效"（报表页实测踩过）。
 */
const dateMode = computed(() => props.modelValue?.date ?? '');
const digits = computed(() => props.modelValue?.digits ?? props.column?.precision ?? 2);

const digitOptions = computed(() =>
  [0, 1, 2, 3, 4].map(value => ({
    value,
    label: value === 0 ? '只显示整数' : `${value} 位小数`,
    sample: (1234.5678).toLocaleString('zh-CN', { minimumFractionDigits: value, maximumFractionDigits: value })
  }))
);

function setDate(value: string | number | boolean | undefined) {
  if (value !== 'date' && value !== 'datetime') return;
  emit('update:modelValue', { ...(props.modelValue || {}), date: value });
}

function setDigits(value: string | number | boolean | undefined) {
  const next = Number(value);
  if (!Number.isFinite(next)) return;
  emit('update:modelValue', { ...(props.modelValue || {}), digits: next });
}

function reset() {
  emit('update:modelValue', undefined);
}
</script>

<style scoped>
.format-panel { min-width: 208px; }
.format-formula { margin: 0 0 8px; padding: 6px 8px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.format-formula-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; font-size: 11px; color: var(--el-text-color-secondary); }
.format-formula-head .fx { font-family: Georgia, serif; font-style: italic; font-weight: 600; color: var(--el-color-primary); }
.format-formula-body { display: block; max-height: 132px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 18px; color: #1f2329; word-break: break-word; white-space: pre-wrap; }
.format-title { display: flex; align-items: baseline; gap: 6px; margin: 0 0 6px; padding-bottom: 6px; border-bottom: 1px solid var(--el-border-color-lighter); }
.format-name { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.format-kind { font-size: 12px; color: var(--el-text-color-secondary); }
.format-options { display: flex; flex-direction: column; align-items: stretch; gap: 1px; width: 100%; }
.format-options :deep(.el-radio) { height: auto; margin: 0; padding: 4px 6px; border-radius: 4px; }
.format-options :deep(.el-radio:hover) { background: var(--el-fill-color-light); }
.format-options :deep(.el-radio__label) { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.format-options em { font-style: normal; font-size: 12px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.format-hint { margin: 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
.format-footer { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--el-border-color-lighter); }
</style>
