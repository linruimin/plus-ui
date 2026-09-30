<template>
 <div class="filter-builder">
  <el-input :model-value="keyword" placeholder="搜索文字字段" clearable @update:model-value="emit('update:keyword',$event)" @change="emit('search')"/>
  <div class="filter-head">
   <strong>筛选条件</strong>
   <el-radio-group v-if="conditions.length>1" :model-value="conjunction" size="small" @update:model-value="setConjunction">
    <el-radio-button value="and">且</el-radio-button>
    <el-radio-button value="or">或</el-radio-button>
   </el-radio-group>
   <el-button link type="primary" :disabled="!columns.length" @click="addCondition">添加条件</el-button>
   <el-button link :disabled="!conditions.length" @click="clearAll">清空</el-button>
  </div>
  <p v-if="!conditions.length" class="hint">暂无筛选条件。添加后按「且 / 或」组合，设置随视图自动保存。</p>
  <div v-for="(condition,index) in conditions" :key="index" class="filter-row">
   <el-select class="field" :model-value="condition.field" placeholder="字段" @update:model-value="changeField(index,$event)">
    <el-option v-for="option in fieldOptions(condition.field)" :key="option.prop" :label="option.label" :value="option.prop" :disabled="option.prop!==condition.field&&usedFields.includes(option.prop)"/>
   </el-select>
   <el-select class="operator" :model-value="condition.operator" placeholder="条件" @update:model-value="changeOperator(index,$event)">
    <el-option v-for="option in operatorsFor(fieldOf(condition.field))" :key="option.value" :label="option.label" :value="option.value"/>
   </el-select>
   <span class="value">
    <span v-if="!needValue(condition)" class="value-empty">—</span>
    <ReferencePicker v-else-if="fieldOf(condition.field)?.reference" :model-value="condition.value||''" :target="fieldOf(condition.field)!.reference!" @update:model-value="setValue(index,$event??'',true)"/>
    <el-select v-else-if="fieldOf(condition.field)?.options" :model-value="condition.value||''" clearable filterable placeholder="选择值" @update:model-value="setValue(index,$event??'',true)">
     <el-option v-for="option in fieldOf(condition.field)!.options" :key="option" :label="option" :value="option"/>
    </el-select>
    <el-date-picker v-else-if="fieldOf(condition.field)?.type==='date'" :model-value="condition.value||''" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="选择时间" clearable @update:model-value="setValue(index,$event??'',true)"/>
    <el-input v-else :model-value="condition.value||''" clearable :placeholder="fieldOf(condition.field)?.numeric?'输入数值':'输入文字'" @update:model-value="setValue(index,$event)" @change="emit('search')"/>
   </span>
   <el-button text icon="Close" aria-label="移除此条件" @click="removeCondition(index)"/>
  </div>
 </div>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import ReferencePicker from '../business/ReferencePicker.vue';
import type {BusinessField} from '../business/config';
import type {FilterCondition} from '@/api/ozon/business';
interface Operator { value:string; label:string }
const props=withDefaults(defineProps<{conditions:FilterCondition[];conjunction:'and'|'or';keyword:string;columns:BusinessField[];fields?:BusinessField[]}>(),{fields:undefined});
const emit=defineEmits<{'update:conditions':[value:FilterCondition[]];'update:conjunction':[value:'and'|'or'];'update:keyword':[value:string];'search':[]}>();
/** 与后端 applyCondition 支持的运算符一一对应，按字段类型给出可选范围。 */
const TEXT_OPS:Operator[]=[{value:'is',label:'是'},{value:'isNot',label:'不是'},{value:'contains',label:'包含'},{value:'notContains',label:'不包含'},{value:'isEmpty',label:'为空'},{value:'isNotEmpty',label:'不为空'}];
const SELECT_OPS:Operator[]=[{value:'is',label:'是'},{value:'isNot',label:'不是'},{value:'isEmpty',label:'为空'},{value:'isNotEmpty',label:'不为空'}];
const NUMBER_OPS:Operator[]=[{value:'is',label:'等于'},{value:'isNot',label:'不等于'},{value:'gt',label:'大于'},{value:'gte',label:'大于等于'},{value:'lt',label:'小于'},{value:'lte',label:'小于等于'},{value:'isEmpty',label:'为空'},{value:'isNotEmpty',label:'不为空'}];
const DATE_OPS:Operator[]=[{value:'is',label:'是'},{value:'isNot',label:'不是'},{value:'gt',label:'晚于'},{value:'gte',label:'不早于'},{value:'lt',label:'早于'},{value:'lte',label:'不晚于'},{value:'isEmpty',label:'为空'},{value:'isNotEmpty',label:'不为空'}];
const usedFields=computed(()=>props.conditions.map(condition=>condition.field));
/** columns 是可新增字段（可能被全局店铺范围裁剪），fields 是全量字段，仅用于回显已有条件的字段名与取值控件。 */
const fieldOf=(prop:string)=>(props.fields&&props.fields.length?props.fields:props.columns).find(column=>column.prop===prop);
function operatorsFor(field?:BusinessField):Operator[]{
 if(!field)return TEXT_OPS;
 if(field.type==='date')return DATE_OPS;
 if(field.options||field.reference)return SELECT_OPS;
 if(field.numeric)return NUMBER_OPS;
 return TEXT_OPS;
}
function fieldOptions(current:string){
 const options=props.columns.map(column=>({prop:column.prop,label:column.label}));
 if(current&&!options.some(option=>option.prop===current))options.unshift({prop:current,label:fieldOf(current)?.label||current});
 return options;
}
function needValue(condition:FilterCondition){return condition.operator!=='isEmpty'&&condition.operator!=='isNotEmpty';}
function update(next:FilterCondition[]){emit('update:conditions',next);}
function changeField(index:number,field:string){
 const operators=operatorsFor(fieldOf(field));
 update(props.conditions.map((condition,position)=>position===index?{field,operator:operators[0].value,value:''}:condition));
}
function changeOperator(index:number,operator:string){
 update(props.conditions.map((condition,position)=>position===index?{...condition,operator,value:operator==='isEmpty'||operator==='isNotEmpty'?'':condition.value||''}:condition));
 if(operator==='isEmpty'||operator==='isNotEmpty')emit('search');
}
function setValue(index:number,value:string,apply=false){
 update(props.conditions.map((condition,position)=>position===index?{...condition,value}:condition));
 if(apply)emit('search');
}
function addCondition(){
 const column=props.columns.find(candidate=>!usedFields.value.includes(candidate.prop))||props.columns[0];
 if(!column)return;
 const operators=operatorsFor(column);
 update([...props.conditions,{field:column.prop,operator:operators[0].value,value:''}]);
}
function removeCondition(index:number){update(props.conditions.filter((_,position)=>position!==index));emit('search');}
function clearAll(){update([]);emit('update:conjunction','and');emit('update:keyword','');emit('search');}
function setConjunction(value:'and'|'or'){emit('update:conjunction',value);emit('search');}
</script>
<style scoped>
.filter-builder{display:flex;flex-direction:column;gap:8px}
.filter-head{display:flex;align-items:center;gap:8px}
.filter-head strong{font-size:13px;color:var(--el-text-color-primary)}
.filter-head .el-button{--el-button-size:22px;padding:0}
.filter-row{display:flex;align-items:center;gap:6px}
.filter-row .field{flex:0 0 128px}
.filter-row .operator{flex:0 0 100px}
.filter-row .value{flex:1 1 auto;min-width:0}
.filter-row .value .el-select,.filter-row .value .el-date-editor{width:100%}
.value-empty{display:inline-block;padding-left:6px;color:var(--el-text-color-placeholder)}
.hint{font-size:12px;color:var(--el-text-color-secondary);line-height:1.6;margin:0}
</style>
