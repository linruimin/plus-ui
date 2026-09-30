<template>
  <div class="saved-views">
    <el-button v-for="view in views" :key="view.id" :type="view.id === modelValue ? 'primary' : 'default'" :aria-pressed="view.id === modelValue" @click="emit('select', view.id)">{{ view.name }}</el-button>
    <el-dropdown @command="emit('action', $event)">
      <el-button aria-label="管理视图" icon="MoreFilled" />
      <template #dropdown><el-dropdown-menu>
        <el-dropdown-item command="add">新增视图</el-dropdown-item>
        <el-dropdown-item command="rename">重命名</el-dropdown-item>
        <el-dropdown-item command="remove">删除视图</el-dropdown-item>
        <el-dropdown-item command="reset">恢复此视图</el-dropdown-item>
      </el-dropdown-menu></template>
    </el-dropdown>
  </div>
</template>
<script setup lang="ts">
import type { SavedView } from './savedViews';
defineProps<{ modelValue: string; views: SavedView[] }>();
const emit = defineEmits<{ select: [id: string]; action: [action: 'add' | 'rename' | 'remove' | 'reset'] }>();
</script>
<style scoped>
.saved-views { display:flex; flex:1 1 auto; min-width:0; gap:6px; align-items:center; flex-wrap:nowrap; overflow-x:auto; white-space:nowrap; }
.saved-views :deep(.el-button) { flex:none; }
.saved-views :deep(.el-button + .el-button) { margin-left:0; }
</style>
