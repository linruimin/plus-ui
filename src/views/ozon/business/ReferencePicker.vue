<template>
 <el-select :model-value="modelValue" :multiple="multiple" filterable remote clearable :remote-method="search" :loading="loading" placeholder="输入名称或编号查找" style="width:100%" @update:model-value="$emit('update:modelValue',$event === '' ? null : $event)">
  <el-option v-for="row in options" :key="String(row.id)" :value="String(row[valueKey])" :label="recordLabel(row)" />
 </el-select>
</template>
<script setup lang="ts">
import { ref,watch } from 'vue';
import { listBusiness,getBusiness,scopeBusinessQuery } from '@/api/ozon/business';
import { useOzonShopStore } from '@/store/modules/ozonShop';
import type { BusinessRow } from '@/api/ozon/business';
import { businessConfig,recordLabel } from './config';
const props=withDefaults(defineProps<{modelValue?:string|string[]|null;target:string;multiple?:boolean;valueKey?:string}>(),{valueKey:'id'});
defineEmits<{(e:'update:modelValue',value:any):void}>();
const options=ref<BusinessRow[]>([]),loading=ref(false);
const shopStore=useOzonShopStore();
let requestVersion=0;
async function search(keyword=''){
 const version=++requestVersion; const cfg=businessConfig[props.target];if(!cfg)return;
 loading.value=true;
 try{
  const shopId=await shopStore.ensureLoaded();
  if(version!==requestVersion)return;
  const result=await listBusiness(cfg.endpoint,scopeBusinessQuery({pageNum:1,pageSize:100,keyword},shopId));
  if(version!==requestVersion)return;
  const selected=Array.isArray(props.modelValue)?props.modelValue:props.modelValue?[props.modelValue]:[];
  const keep=options.value.filter(r=>selected.includes(String(r[props.valueKey])));
  const rows=result.data?.rows||[];
  const found=new Map([...keep,...rows].map(r=>[String(r.id),r]));
  if(props.valueKey==='id') for(const id of selected)if(!found.has(id)){
   try{const detail=await getBusiness(cfg.endpoint,id);if(detail.data)found.set(id,detail.data);}catch{/* API displays an error for removed or inaccessible references. */}
  }
  if(version===requestVersion)options.value=[...found.values()];
 }finally{if(version===requestVersion)loading.value=false;}
}
watch(()=>[props.target,JSON.stringify(props.modelValue),shopStore.selectionKey],()=>{options.value=[];void search().catch(()=>{});},{immediate:true});
</script>
