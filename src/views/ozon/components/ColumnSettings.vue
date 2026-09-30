<template>
  <el-popover placement="bottom-end" trigger="click" :width="Math.min(490, viewportWidth - 24)">
    <template #reference><el-button icon="Setting">列设置</el-button></template>
    <p class="column-help">勾选显示列，调整顺序或固定到左侧、右侧。操作列始终固定在最右侧。</p>
    <div class="column-list">
      <div v-for="(key, index) in editableOrder" :key="key" class="column-item" draggable="true" @dragstart="startDrag($event, key)" @dragover.prevent @drop.prevent="dropAt(key)" @dragend="dragged = ''">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <el-checkbox :model-value="!state.hidden.includes(key)" :disabled="!state.hidden.includes(key) && visibleCount === 1" @change="toggle(key)">{{ labels.get(key) }}</el-checkbox>
        <el-select :model-value="state.fixed?.[key] || ''" size="small" class="pin-select" :aria-label="labels.get(key) + '固定位置'" @change="pin(key, $event)">
          <el-option label="不固定" value="" /><el-option label="固定左侧" value="left" /><el-option label="固定右侧" value="right" />
        </el-select>
        <div class="move-buttons">
          <el-button text size="small" icon="ArrowUp" :aria-label="labels.get(key) + '上移'" :disabled="index === 0" @click="move(key, index - 1)" />
          <el-button text size="small" icon="ArrowDown" :aria-label="labels.get(key) + '下移'" :disabled="index === editableOrder.length - 1" @click="move(key, index + 1)" />
        </div>
      </div>
    </div>
    <el-button link type="primary" @click="emit('update:modelValue', normalizeColumns({}, columns))">恢复默认列</el-button>
  </el-popover>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWindowSize } from '@vueuse/core';
import type { ReportColumn } from './columns';
import { normalizeColumns, type ColumnPreference } from './preferences';
const props = defineProps<{ columns: ReportColumn[]; modelValue: ColumnPreference }>();
const emit = defineEmits<{ 'update:modelValue': [value: ColumnPreference] }>();
const { width: viewportWidth } = useWindowSize();
const state = computed(() => normalizeColumns(props.modelValue, props.columns));
const labels = computed(() => new Map(props.columns.map(column => [column.prop, column.label])));
const editableOrder = computed(() => state.value.order.filter(key => key !== '__actions'));
const visibleCount = computed(() => editableOrder.value.filter(key => !state.value.hidden.includes(key)).length);
function pin(key: string, side: '' | 'left' | 'right') {
  const fixed = { ...state.value.fixed }; if (side) fixed[key] = side; else delete fixed[key];
  emit('update:modelValue', normalizeColumns({ ...state.value, fixed }, props.columns));
}
const dragged = ref('');
function toggle(key: string) {
  const hidden = state.value.hidden.includes(key) ? state.value.hidden.filter(item => item !== key) : [...state.value.hidden, key];
  emit('update:modelValue', normalizeColumns({ ...state.value, hidden }, props.columns));
}
function move(key: string, target: number) {
  const order = [...editableOrder.value];
  const source = order.indexOf(key);
  if (source < 0 || target < 0 || target >= order.length || source === target) return;
  order.splice(source, 1); order.splice(target, 0, key);
  emit('update:modelValue', normalizeColumns({ ...state.value, order }, props.columns));
}
function startDrag(event: DragEvent, key: string) {
  dragged.value = key;
  event.dataTransfer?.setData('text/plain', key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}
function dropAt(key: string) { move(dragged.value, editableOrder.value.indexOf(key)); dragged.value = ''; }
</script>
<style scoped>
.column-help { font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); margin: 0 0 8px; }
.column-list { max-height: min(55vh, 440px); overflow-y: auto; margin-bottom: 8px; }
.column-item { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--el-border-color-lighter); }
.drag-handle { cursor: grab; font-size: 20px; }
.column-item :deep(.el-checkbox) { flex: 1; min-width: 0; }
.column-item :deep(.el-checkbox__label) { white-space: normal; font-size: 12px; }
.pin-select { flex: 0 0 100px; }
.move-buttons { display: flex; }
.move-buttons :deep(.el-button + .el-button) { margin-left: 0; }
</style>
