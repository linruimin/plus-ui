<template>
 <div class="reference-field" :class="{'is-empty':!selected.length,'is-disabled':disabled}" :title="title" @click="open">
  <span v-for="item in selected" :key="item.value" class="reference-chip" :title="item.label">{{ item.label }}</span>
  <span v-if="!selected.length" class="reference-placeholder">{{ placeholder }}</span>
  <button v-if="selected.length&&!disabled" type="button" class="reference-clear" title="清除" @click.stop="clear">×</button>
 </div>
 <el-dialog v-model="visible" :title="'选择' + targetTitle" width="min(940px,94vw)" append-to-body destroy-on-close :close-on-click-modal="false" class="reference-picker-dialog">
  <div class="reference-toolbar">
   <el-input v-model="keyword" :placeholder="'搜索' + targetTitle" clearable :prefix-icon="Search" class="reference-search" @keyup.enter="search"/>
   <el-button type="primary" @click="search">查询</el-button>
   <small class="reference-tip">{{ multiple ? '点击行可多选，选完点确定回填' : '点击任意一行即可选中并回填' }}</small>
  </div>
  <el-table ref="gridRef" v-loading="loading" :data="rows" height="380" border row-key="id" :row-class-name="rowClass" @row-click="onRowClick" @row-dblclick="onRowDblClick">
   <el-table-column v-for="column in columns" :key="column.prop" :prop="column.prop" :label="column.label" :width="column.width" show-overflow-tooltip>
    <template #default="{row}">{{ cellText(row,column) }}</template>
   </el-table-column>
   <template #empty><span class="reference-empty">{{ loading ? '读取中…' : '没有可选择的' + targetTitle }}</span></template>
  </el-table>
  <pagination v-show="total>0" v-model:page="page" v-model:limit="size" :total="total" :auto-scroll="false" @pagination="load"/>
  <template #footer>
   <el-button @click="visible=false">取消</el-button>
   <el-button type="primary" :disabled="!pending.length" @click="submit">{{ multiple ? '确定（' + pending.length + '）' : '确定' }}</el-button>
  </template>
 </el-dialog>
</template>
<script setup lang="ts">
import {computed,nextTick,ref,watch} from 'vue';
import {ElMessage} from 'element-plus';
import {Search} from '@element-plus/icons-vue';
import {listBusiness,getBusiness,scopeBusinessQuery} from '@/api/ozon/business';
import {useOzonShopStore} from '@/store/modules/ozonShop';
import type {BusinessRow} from '@/api/ozon/business';
import {businessConfig,shortLabel} from './config';
import type {BusinessField} from './config';
import {formatNumericColumn} from '../components/columns';
/** 关联字段的候选列优先展示这几列，未配置的表回退到前几列可见列。 */
const preferredColumns:Record<string,string[]>={
 purchase_order:['orderNo','productId','shopId','quantity','actualPaid','payStatus','paidAt'],
 product:['productNo','name','sku','articleNo','shopId','unitPerPack','backendPrice'],
 replenishment:['replenishNo','productId','expectedDate','expectedQty','method','remark'],
 shipment:['shipmentNo','purchaseId','logisticsMethod','boxes','perBoxQty','shippedAt'],
 logistics_fee:['feeNo','feeType','amount','feeDate','paidFlag','shopId'],
 other_fee:['feeNo','feeType','amount','feeDate','shopId','remark'],
 logistics_provider:['code','name','warehouse','bank','customerSystem'],
 studio_receipt:['orderNo','quantity','boxCount','boxSpec','boxWeight','receivedAt'],
 payment_receipt:['code','paidAt','amount','exchangeRate','shopId','remark'],
 attachment:['fileName','sourceTable','fieldName','createdAt'],
 shop:['name','nameRu','id']
};
const props=withDefaults(defineProps<{modelValue?:string|number|Array<string|number>|null;target:string;multiple?:boolean;disabled?:boolean;placeholder?:string;label?:string}>(),{placeholder:'点击选择'});
const emit=defineEmits<{(e:'update:modelValue',value:any):void}>();
const shopStore=useOzonShopStore();
const visible=ref(false),loading=ref(false),keyword=ref(''),rows=ref<BusinessRow[]>([]),total=ref(0),page=ref(1),size=ref(20);
const pending=ref<string[]>([]);
const labelCache=ref<Record<string,string>>({});
const gridRef=ref();
const targetTitle=computed(()=>businessConfig[props.target]?.title||'记录');
const values=computed<string[]>(()=>{
 const value=props.modelValue;
 if(Array.isArray(value))return value.filter(item=>item!==null&&item!==undefined&&item!=='').map(String);
 return value===null||value===undefined||value===''?[]:[String(value)];
});
const selected=computed(()=>values.value.map(value=>({value,label:labelCache.value[value]||(values.value.length===1&&props.label?String(props.label):'记录 '+value)})));
const title=computed(()=>selected.value.length?selected.value.map(item=>item.label).join('、'):props.placeholder);
const columns=computed<BusinessField[]>(()=>{
 const config=businessConfig[props.target];
 if(!config)return [];
 const preferred=(preferredColumns[props.target]||[]).map(prop=>config.columns.find(column=>column.prop===prop)).filter((column):column is BusinessField=>!!column&&!column.attachment&&!column.multiple);
 const picked=preferred.length?preferred:config.columns.filter(column=>column.prop!=='id'&&!column.attachment&&!column.multiple&&!column.readonly);
 return picked.slice(0,6);
});
function cellText(row:BusinessRow,column:BusinessField){
 if(column.reference){const label=row[column.prop+'Label'];return label===null||label===undefined||label===''?(row[column.prop]??'—'):String(label);}
 const value=row[column.prop];
 if(value===null||value===undefined||value==='')return '—';
 if(column.numeric)return formatNumericColumn(value,column);
 if(column.type==='date')return String(value).replace('T',' ').slice(0,19);
 return String(value);
}
function rowClass({row}:{row:BusinessRow}){
 const marked=props.multiple?pending.value:values.value;
 return marked.includes(String(row.id))?'reference-row-picked':'';
}
function remember(){
 for(const row of rows.value){
  const id=String(row.id);
  if(values.value.includes(id)||pending.value.includes(id))labelCache.value[id]=shortLabel(row,props.target);
 }
}
watch(rows,remember);
watch(pending,remember,{deep:true});
watch(values,()=>{void fillLabels();},{immediate:true});
/** 已选但不在当前页的记录，单独取回显示名，避免只看到裸 ID。 */
async function fillLabels(){
 for(const value of values.value){
  if(labelCache.value[value])continue;
  if(values.value.length===1&&props.label)continue;
  try{labelCache.value[value]=shortLabel((await getBusiness(props.target,value)).data,props.target);}
  catch{/* 记录已删除或无权访问时保留占位显示 */}
 }
}
function open(){
 if(props.disabled)return;
 pending.value=[...values.value];
 keyword.value='';
 page.value=1;
 visible.value=true;
 void fillLabels();
 void load();
 void nextTick(()=>{gridRef.value?.setScrollTop?.(0);});
}
function clear(){emit('update:modelValue',props.multiple?[]:null);}
function search(){page.value=1;void load();}
async function load(){
 const config=businessConfig[props.target];
 if(!config)return;
 loading.value=true;
 try{
  const shopId=await shopStore.ensureLoaded();
  const result=await listBusiness(config.endpoint,scopeBusinessQuery({pageNum:page.value,pageSize:size.value,keyword:keyword.value.trim()||undefined,orderByColumn:'id',isAsc:'desc'},shopId));
  rows.value=result.data?.rows||[];
  total.value=result.data?.total||0;
 }catch{rows.value=[];total.value=0;ElMessage.error('读取'+targetTitle.value+'失败，请重试');}
 finally{loading.value=false;}
}
function onRowClick(row:BusinessRow){
 const id=String(row.id);
 if(!props.multiple){submit(String(row.id),row);return;}
 pending.value=pending.value.includes(id)?pending.value.filter(item=>item!==id):[...pending.value,id];
}
function onRowDblClick(row:BusinessRow){submit(props.multiple?[...new Set([...pending.value,String(row.id)])]:String(row.id),row);}
function submit(value?:string|string[],row?:BusinessRow){
 const result=value===undefined?(props.multiple?pending.value:pending.value.slice(0,1)):value;
 const ids=Array.isArray(result)?result:[result];
 if(!ids.length)return;
 if(row)labelCache.value[String(row.id)]=shortLabel(row,props.target);
 emit('update:modelValue',props.multiple?ids:ids[0]);
 visible.value=false;
}
</script>
<style scoped>
.reference-field{display:flex;align-items:center;gap:4px;min-height:22px;width:100%;min-width:0;cursor:pointer;overflow:hidden;border-radius:4px}
.reference-field:hover{background:var(--el-color-primary-light-9)}
.reference-field.is-disabled{cursor:not-allowed}
.reference-field.is-disabled:hover{background:none}
.reference-chip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 6px;border-radius:3px;background:var(--el-color-primary-light-9);color:var(--el-color-primary);font-size:12px;line-height:16px}
.reference-placeholder{color:var(--el-text-color-placeholder)}
.reference-clear{margin-left:auto;flex:none;border:0;background:none;padding:0 2px;color:var(--el-text-color-placeholder);cursor:pointer;font-size:14px;line-height:1}
.reference-clear:hover{color:var(--el-color-danger)}
.reference-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.reference-search{max-width:320px}
.reference-tip{color:var(--el-text-color-secondary);font-size:12px}
.reference-empty{color:var(--el-text-color-secondary);font-size:13px}
</style>
<style>
/* 弹窗内表格挂在 body 上，选中行高亮需要全局选择器。 */
.reference-row-picked td.el-table__cell{background:var(--el-color-primary-light-9)!important}
</style>
