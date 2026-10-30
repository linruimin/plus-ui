<template>
  <div class="format-panel">
    <p class="format-title">
      <span class="format-name">{{ column?.label || '字段' }}</span>
      <span class="format-kind">{{ kindText }}</span>
    </p>

    <!-- 公式（计算列才有）：默认只读展示，点「编辑」后可改写；字段用 {列名} 引用 -->
    <div v-if="showFormula" class="format-formula">
      <div class="format-formula-head">
        <span class="fx">ƒx</span>
        <span>公式</span>
        <span v-if="formulaCustom" class="format-badge">自定义</span>
        <span class="format-spacer" />
        <el-button v-if="!editing && formula" link type="primary" size="small" @click="startEdit">编辑</el-button>
      </div>

      <template v-if="!editing">
        <code class="format-formula-body">{{ formula || '（空）' }}</code>
        <p v-if="formulaCustom" class="format-formula-meta">按本行数据实时计算；排序、筛选、小计仍按数据库值</p>
      </template>

      <template v-else>
        <el-input
          v-model="draft"
          type="textarea"
          :rows="4"
          resize="vertical"
          placeholder="例：{每包成本} + {单个打包费用} + {单个取货送仓费用}"
        />
        <div class="format-formula-insert">
          <el-select size="small" placeholder="插入字段" filterable :model-value="''" @change="insertField">
            <el-option v-for="name in fieldOptions" :key="name" :label="name" :value="name" />
          </el-select>
          <span class="format-formula-tip">可用 + − × ÷ ( ) round/min/max/if</span>
        </div>
        <p v-if="error" class="format-formula-error">{{ error }}</p>
        <div class="format-formula-actions">
          <el-button size="small" type="primary" :loading="saving" @click="submit">保存</el-button>
          <el-button size="small" @click="cancel">取消</el-button>
          <el-button v-if="formulaCustom" size="small" link type="danger" @click="resetFormula">恢复默认</el-button>
        </div>
      </template>
    </div>

    <el-radio-group v-if="kind === 'date'" class="format-options" :model-value="dateMode" @change="setDate">
      <el-radio value="datetime">年月日 时分秒<em>2026-10-07 14:30:00</em></el-radio>
      <el-radio value="date">只显示年月日<em>2026-10-07</em></el-radio>
    </el-radio-group>

    <div v-if="kind === 'number'" class="format-digits">
      <span class="format-digits-label">小数位数</span>
      <el-select :model-value="digits" size="small" class="format-digits-select" @change="setDigits">
        <el-option label="自动" :value="-1" />
        <el-option v-for="n in 7" :key="n" :label="`${n - 1} 位小数`" :value="n - 1" />
      </el-select>
      <em class="format-digits-sample">{{ sample }}</em>
    </div>

    <p v-if="kind === 'text'" class="format-hint">文本字段没有可选的显示格式。</p>

    <div v-if="kind !== 'text' && hasFormat" class="format-footer">
      <el-button link type="primary" size="small" @click="reset">恢复默认格式</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { columnFormatKind, type ColumnFormat, type ReportColumn } from './columns';
import { validateFormula } from './formulaEval';

// 表头点击后弹出的列面板：上半部分是计算列的公式（可编辑），下半部分是显示格式（只管显示）。
const props = defineProps<{
  column: ReportColumn | null;
  modelValue?: ColumnFormat;
  /** 当前生效的公式（自定义优先，否则是视图内置） */
  formula?: string;
  /** 公式是否为用户自定义 */
  formulaCustom?: boolean;
  /** 可插入的字段名（本表其它列的中文名） */
  fieldOptions?: string[];
  /** 保存中 */
  saving?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: ColumnFormat | undefined];
  'save-formula': [expression: string];
  'reset-formula': [];
}>();

const kind = computed(() => (props.column ? columnFormatKind(props.column) : 'text'));
const kindText = computed(() => {
  const base = ({ date: '日期字段', number: '数字字段', text: '文本字段' } as Record<string, string>)[kind.value];
  return props.column?.readonly ? `计算列 · ${base}` : base;
});

const showFormula = computed(() => !!props.column?.readonly);
const editing = ref(false);
const draft = ref('');
const error = ref('');

const hasFormat = computed(() => {
  const format = props.modelValue;
  return !!(format && (format.date !== undefined || format.digits !== undefined));
});
const dateMode = computed(() => props.modelValue?.date ?? '');
/** -1 = 自动（计算列的默认：按字段含义定上限且不补零）；非计算列没设过时按 precision/2 预选。 */
const digits = computed(() => {
  if (props.modelValue?.digits !== undefined) return props.modelValue.digits;
  if (props.column?.readonly) return -1;
  return props.column?.precision ?? 2;
});
const sample = computed(() =>
  (1234.5678).toLocaleString('zh-CN', digits.value < 0
    ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: digits.value, maximumFractionDigits: digits.value })
);

const fieldOptions = computed(() => props.fieldOptions || []);

function startEdit() {
  draft.value = props.formula || '';
  error.value = '';
  editing.value = true;
}

function cancel() {
  editing.value = false;
  error.value = '';
}

function insertField(name: string | number | boolean | undefined) {
  if (typeof name !== 'string' || !name) return;
  const snippet = `{${name}}`;
  const text = draft.value || '';
  draft.value = text && !/[\s(]$/.test(text) ? `${text} ${snippet}` : `${text}${snippet}`;
}

function submit() {
  const expression = (draft.value || '').trim();
  if (!expression) {
    error.value = '公式不能为空';
    return;
  }
  const message = validateFormula(expression);
  if (message) {
    error.value = message;
    return;
  }
  error.value = '';
  emit('save-formula', expression);
  editing.value = false;
}

function resetFormula() {
  editing.value = false;
  error.value = '';
  emit('reset-formula');
}

function setDate(value: string | number | boolean | undefined) {
  if (value !== 'date' && value !== 'datetime') return;
  emit('update:modelValue', { ...(props.modelValue || {}), date: value });
}

function setDigits(value: string | number | boolean | undefined) {
  const next = Number(value);
  if (!Number.isFinite(next)) return;
  if (next < 0) {
    // 「自动」= 清掉 digits，交回默认精度规则
    const { digits: _drop, ...rest } = props.modelValue || {};
    emit('update:modelValue', Object.keys(rest).length ? rest : undefined);
    return;
  }
  emit('update:modelValue', { ...(props.modelValue || {}), digits: next });
}

function reset() {
  emit('update:modelValue', undefined);
}
</script>

<style scoped>
.format-panel { min-width: 258px; }
.format-title { display: flex; align-items: baseline; gap: 6px; margin: 0 0 6px; padding-bottom: 6px; border-bottom: 1px solid var(--el-border-color-lighter); }
.format-name { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.format-kind { font-size: 12px; color: var(--el-text-color-secondary); }

.format-formula { margin: 0 0 8px; padding: 6px 8px; background: var(--el-fill-color-lighter); border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.format-formula-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; font-size: 11px; color: var(--el-text-color-secondary); }
.format-formula-head .fx { font-family: Georgia, serif; font-style: italic; font-weight: 600; color: var(--el-color-primary); }
.format-spacer { flex: 1; }
.format-badge { padding: 0 5px; border-radius: 8px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-size: 10px; line-height: 15px; }
.format-formula-body { display: block; max-height: 128px; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 18px; color: #1f2329; word-break: break-word; white-space: pre-wrap; }
.format-formula-meta { margin: 4px 0 0; font-size: 10px; line-height: 15px; color: var(--el-text-color-placeholder); }
.format-formula-insert { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.format-formula-insert :deep(.el-select) { width: 130px; }
.format-formula-tip { font-size: 10px; color: var(--el-text-color-placeholder); }
.format-formula-error { margin: 4px 0 0; font-size: 11px; color: var(--el-color-danger); }
.format-formula-actions { display: flex; align-items: center; gap: 6px; margin-top: 6px; }

.format-options { display: flex; flex-direction: column; align-items: stretch; gap: 1px; width: 100%; }
.format-options :deep(.el-radio) { height: auto; margin: 0; padding: 4px 6px; border-radius: 4px; }
.format-options :deep(.el-radio:hover) { background: var(--el-fill-color-light); }
.format-options :deep(.el-radio__label) { display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.format-options em { font-style: normal; font-size: 12px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }

.format-digits { display: flex; align-items: center; gap: 8px; }
.format-digits-label { font-size: 13px; color: var(--el-text-color-regular); white-space: nowrap; }
.format-digits-select { width: 116px; }
.format-digits-sample { font-style: normal; font-size: 12px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }

.format-hint { margin: 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
.format-footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--el-border-color-lighter); }
</style>
