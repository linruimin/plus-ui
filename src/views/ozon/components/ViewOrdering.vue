<template>
  <el-popover placement="bottom-end" trigger="click" :width="Math.min(440, width - 24)">
    <template #reference><el-button icon="Sort">分组 / 排序</el-button></template>
    <div v-for="kind in (['groups', 'sorts'] as const)" :key="kind" class="order-section">
      <strong>{{ kind === 'groups' ? '分组（最多 3 层）' : '排序（最多 5 项）' }}</strong>
      <div v-for="(item, index) in values(kind)" :key="index" class="order-row">
        <el-select :model-value="item.field" aria-label="字段" @change="change(kind,index,{field:$event})">
          <el-option v-for="column in columns" :key="column.prop" :label="column.label" :value="column.prop" :disabled="values(kind).some((v,i)=>i!==index&&v.field===column.prop)" />
        </el-select>
        <el-select :model-value="item.desc" aria-label="方向" class="direction" @change="change(kind,index,{desc:$event})"><el-option :value="false" label="正序"/><el-option :value="true" label="倒序"/></el-select>
        <el-button text icon="Close" aria-label="移除此项" @click="remove(kind,index)" />
      </div>
      <el-button link type="primary" :disabled="values(kind).length >= (kind === 'groups' ? 3 : 5) || values(kind).length >= columns.length" @click="add(kind)">添加{{ kind === 'groups' ? '分组' : '排序' }}</el-button>
    </div>
    <p class="hint">按上方顺序依次分组、排序。分组跨页时继续显示，设置自动保存到当前视图。</p>
  </el-popover>
</template>
<script setup lang="ts">
import { useWindowSize } from '@vueuse/core';
import type { ReportColumn } from './columns';
import type { ViewOrder } from './savedViews';
const props=defineProps<{columns:ReportColumn[];groups:ViewOrder[];sorts:ViewOrder[]}>();
const emit=defineEmits<{'update:groups':[value:ViewOrder[]];'update:sorts':[value:ViewOrder[]];change:[]}>();
const {width}=useWindowSize();
type Kind='groups'|'sorts';
const values=(kind:Kind)=>props[kind];
function update(kind:Kind,value:ViewOrder[]){if(kind==='groups')emit('update:groups',value);else emit('update:sorts',value);emit('change');}
function change(kind:Kind,index:number,patch:Partial<ViewOrder>){update(kind,values(kind).map((v,i)=>i===index?{...v,...patch}:v));}
function remove(kind:Kind,index:number){update(kind,values(kind).filter((_,i)=>i!==index));}
function add(kind:Kind){const column=props.columns.find(c=>!values(kind).some(v=>v.field===c.prop));if(column)update(kind,[...values(kind),{field:column.prop,desc:false}]);}
</script>
<style scoped>
.order-section{margin-bottom:14px}.order-row{display:flex;gap:6px;align-items:center;margin:8px 0}.direction{flex:0 0 80px}.hint{font-size:12px;color:var(--el-text-color-secondary);line-height:1.6}
</style>
