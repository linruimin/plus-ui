<template>
 <div class="p-2 business-view">
  <el-card shadow="never">
   <template #header><div class="toolbar business-toolbar"><el-tag v-if="shopStore.selectedId" type="primary">{{ shopStore.selectedName }}</el-tag><el-tag v-if="table==='logisticsProvider' || table==='logistics_provider'" type="info">共用物流资料</el-tag><ViewSelector :model-value="viewManager.activeId.value" :views="viewManager.views.value" @select="selectView" @action="viewAction"/><span class="count">共 {{ total }} 条</span><el-tag v-if="draftCount" type="warning">{{ draftCount }} 行待确认</el-tag><div class="actions">
    <el-button v-hasPermi="[permission('add')]" type="primary" icon="Plus" @click="openAdd()">新增</el-button>
    <el-popover placement="bottom-end" trigger="click" :width="460">
     <template #reference><el-button :type="filterCount?'primary':'default'" icon="Filter">筛选{{ filterCount?' · '+filterCount:'' }}</el-button></template>
     <div class="filters">
      <FilterBuilder :conditions="query.conditions||[]" :conjunction="query.conjunction||'and'" :keyword="query.keyword||''" :columns="filterColumns" :fields="allFilterFields" @update:conditions="query.conditions=$event" @update:conjunction="query.conjunction=$event" @update:keyword="query.keyword=$event" @search="search"/>
     </div>
     <div class="toolbar"><el-button type="primary" @click="search">查询</el-button><el-button @click="resetFilters">清空筛选</el-button></div>
    </el-popover>
    <ViewOrdering v-model:groups="groups" v-model:sorts="sorts" :columns="orderColumns" @change="search"/>
    <ColumnSettings v-model="columnState" :columns="activeColumns"/>
   </div></div></template>
   <el-alert v-if="storageWarning || viewManager.storageWarning.value" title="当前浏览器无法保存视图设置" type="warning" :closable="false"/>
   <el-alert v-if="error" :title="error" type="error" :closable="false"/>
   <div ref="tableViewport" class="table-viewport">
   <el-table class="ozon-data-grid" :key="tableKey" v-loading="loading" :data="displayRows" border :show-summary="rows.length>0" :summary-method="summaryMethod" :row-key="rowKey" :row-class-name="({row})=>row.__group?'business-group-row':row.__new?'business-new-row':''" :height="tableHeight" :default-sort="defaultSort" @sort-change="sortChange" @row-contextmenu="onRowContextMenu" @header-contextmenu="onHeaderContextMenu">
    <el-table-column prop="__rowNumber" label="#" width="56" fixed="left" align="center" class-name="row-number-column"><template #default="{row}"><span v-if="!row.__group">{{ row.__new?'＋':(rowNumbers.get(String(row.id))??'') }}</span></template></el-table-column>
    <el-table-column v-for="field in visibleColumns" :key="field.prop" :prop="field.prop" :width="gridColumnWidth(field)" :fixed="field.fixed" :sortable="field.attachment||field.prop==='__actions'||field.multiple||field.customId?false:'custom'" :align="field.numeric&&!field.reference?'right':'left'" show-overflow-tooltip>
     <template #header><span class="field-heading"><span v-if="field.reference" class="field-type-icon" title="引用字段" aria-label="引用字段">↗</span><span v-else-if="field.readonly" class="field-type-icon field-type-formula" title="计算字段" aria-label="计算字段">ƒx</span><span v-else-if="field.customId" class="field-type-icon" :title="field.numeric?'数字字段':'文本字段'">{{ field.numeric?'#':'T' }}</span><span>{{ field.label }}</span></span></template>
     <template #default="{row}">
      <span v-if="row.__group" class="group-cell" :style="field.prop===visibleColumns[0]?.prop?{paddingLeft:(row.__level||0)*14+'px'}:{}" :title="row.__groupTitle||row.__group"><template v-if="field.prop===visibleColumns[0]?.prop"><span class="group-name" :class="{'group-name-secondary':row.__level>0}">{{ row.__groupName }}</span><span class="group-count">{{ row.__count }} 条</span></template><span v-if="row[field.prop]!==undefined" class="group-sum"><span class="sum-prefix">求和</span><span class="sum-value">{{ display(row,field) }}</span></span></span>
      <div v-else-if="field.prop==='__actions'" class="row-actions">
       <template v-if="row.__new">
        <el-button v-hasPermi="[permission('add')]" link type="primary" :loading="rowBusy[row.id]" @click="confirmNewRow">确认</el-button>
        <el-button link :disabled="rowBusy[row.id]" @click="cancelNewRow">取消</el-button>
       </template>
       <template v-else>
        <el-button v-hasPermi="[permission('edit')]" link type="primary"  :loading="rowBusy[row.id]" :disabled="!drafts[row.id]" @click="confirmRow(row)">确认</el-button>
        <el-button v-if="drafts[row.id]" link :disabled="rowBusy[row.id]" @click="discardRow(row)">取消</el-button>
       </template>
      </div>
      <div v-else-if="field.attachment" class="editable-cell attachment-cell" :class="{'is-draft':!!drafts[row.id]&&!row.__new,'is-new-cell':row.__new}" :title="attachmentTitle(row)">
       <AttachmentUpload :files="attachmentList(row)" :editable="attachmentEditable(row)" :code="attachmentCode(row)" :source-table="table" :field-name="field.label" :ensure-draft="()=>ensureAttachmentDraft(row)" @update:files="setAttachments(row,$event)"/>
      </div>
      <div v-else-if="field.customId" class="editable-cell custom-cell" :class="{'is-draft':customEdit?.rowId===String(row.id)&&customEdit?.fieldId===field.customId}" @click="beginCustomCell(row,field)">
       <el-input v-if="customEdit?.rowId===String(row.id)&&customEdit?.fieldId===field.customId" v-model="customEdit.value" :type="field.numeric?'number':'text'" :maxlength="1000" :disabled="customSaving" :aria-label="field.label" @keyup.enter="saveCustomCell(row,field)" @keyup.esc="customEdit=null" @blur="saveCustomCell(row,field)"/>
       <span v-else>{{ display(row,field) }}</span>
      </div>
      <div v-else-if="editable(field,row)" class="editable-cell" :class="{'is-draft':drafts[row.id]&&!row.__new,'is-new-cell':row.__new}" @click="beginCell(row,field)" @keydown.enter.self="beginCell(row,field)" tabindex="0" :title="row.__new?'填写本行后点右侧确认':drafts[row.id]?'修改后点击本行确认':'点击修改'">
       <template v-if="drafts[row.id]">
        <el-select v-if="table==='attachment'&&field.prop==='sourceTable'" v-model="drafts[row.id].sourceTable" :disabled="rowBusy[row.id]" @change="drafts[row.id].feishuRecordId=null"><el-option v-for="(cfg,key) in sourceTables" :key="key" :value="key" :label="cfg.title"/></el-select>
        <ReferencePicker v-else-if="table==='attachment'&&field.prop==='feishuRecordId'" v-model="drafts[row.id].feishuRecordId" :target="drafts[row.id].sourceTable||'product'" value-key="feishuRecordId" :disabled="rowBusy[row.id]"/>
        <ReferenceDialog v-else-if="inputField(field).reference" v-model="drafts[row.id][field.prop]" :target="inputField(field).reference!" :multiple="inputField(field).multiple" :disabled="rowBusy[row.id]" :label="drafts[row.id][field.prop+'Label']"/>
        <el-select v-else-if="inputField(field).options" v-model="drafts[row.id][field.prop]" clearable :disabled="rowBusy[row.id]"><el-option v-for="option in inputField(field).options" :key="option" :label="option" :value="option"/></el-select>
        <el-date-picker v-else-if="inputField(field).type==='date'" v-model="drafts[row.id][field.prop]" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" clearable :disabled="rowBusy[row.id]"/>
        <el-input v-else v-model="drafts[row.id][field.prop]" :maxlength="inputField(field).maxLength" :disabled="rowBusy[row.id]" :aria-label="field.label"/>
       </template>
       <span v-else>{{ rowBusy[row.id]?'读取中…':display(row,field) }}</span>
      </div>
      <span v-else>{{ display(row,field) }}</span>
     </template>
    </el-table-column>
   </el-table>
   <div v-show="hasHorizontalScroll" ref="horizontalTrack" class="horizontal-track" aria-label="表格横向滚动条" @scroll="onTrackScroll"><div :style="{width:scrollContentWidth+'px',height:'1px'}"/></div>
   <div v-if="columnMenu" class="grid-context-menu" :style="{left:columnMenu.x+'px',top:columnMenu.y+'px'}" role="menu">
    <div class="menu-title">{{ columnMenu.field.label }}</div>
    <button type="button" role="menuitem" :disabled="visibleColumns.filter(f=>f.prop!=='__actions').length<=1" @click.stop="hideColumnFromMenu">删除该列（仅当前视图）</button>
    <button v-if="checkPermi([permission('add')])" type="button" role="menuitem" @click.stop="openCustomColumn('before')">在左侧插入新列</button>
    <button v-if="checkPermi([permission('add')])" type="button" role="menuitem" @click.stop="openCustomColumn('after')">在右侧插入新列</button>
    <button v-if="checkPermi([permission('remove')])" type="button" role="menuitem" :disabled="!columnMenu.field.customId&&(protectedFieldProps.has(columnMenu.field.prop)||columnMenu.field.multiple)" @click.stop="deleteColumnFromMenu">永久删除字段</button>
    <small v-if="!columnMenu.field.customId&&(protectedFieldProps.has(columnMenu.field.prop)||columnMenu.field.multiple)">系统关联或编号字段不可永久删除</small>
   </div>
   <div v-if="rowMenu" class="grid-context-menu" :style="{left:rowMenu.x+'px',top:rowMenu.y+'px'}" role="menu">
    <button v-if="checkPermi([permission('add')])" type="button" role="menuitem" @click.stop="insertAtRow('above')">在上方插入行</button>
    <button v-if="checkPermi([permission('add')])" type="button" role="menuitem" @click.stop="insertAtRow('below')">在下方插入行</button>
    <button v-if="checkPermi([permission('remove')])" type="button" role="menuitem" class="danger-action" :disabled="rowBusy[rowMenu.row.id]" @click.stop="deleteRowFromMenu">删除该行</button>
   </div>
   </div>
   <div ref="footerRef" class="business-pagination"><pagination :auto-scroll="false" v-show="total>0" v-model:page="query.pageNum" v-model:limit="query.pageSize" :total="total" @pagination="getList"/></div>
  </el-card>
  <el-dialog v-model="customColumnOpen" title="新建字段" width="360px" append-to-body>
   <el-form label-position="top" @submit.prevent="createCustomColumn">
    <el-form-item label="字段名称"><el-input v-model="customColumnName" maxlength="80" show-word-limit autofocus @keyup.enter="createCustomColumn"/></el-form-item>
    <el-form-item label="字段类型"><el-select v-model="customColumnType"><el-option label="文本" value="text"/><el-option label="数字" value="number"/></el-select></el-form-item>
   </el-form>
   <template #footer><el-button @click="customColumnOpen=false">取消</el-button><el-button type="primary" :loading="customColumnSaving" @click="createCustomColumn">创建字段</el-button></template>
  </el-dialog>
  <el-dialog v-model="dialogOpen" :title="(editing?'编辑':'新增')+config.title" width="min(900px,95vw)" destroy-on-close :close-on-click-modal="false">
   <el-form ref="formRef" :model="form" label-position="top" :disabled="saving">
    <div class="form-grid"><el-form-item v-for="field in activeFields" :key="field.prop" :prop="field.prop" :label="field.label" :rules="field.required?[{required:true,message:'请填写'+field.label,trigger:'change'}]:[]">
     <el-select v-if="table==='attachment'&&field.prop==='sourceTable'" v-model="form.sourceTable" @change="form.feishuRecordId=null"><el-option v-for="(cfg,key) in sourceTables" :key="key" :value="key" :label="cfg.title"/></el-select>
     <ReferencePicker v-else-if="table==='attachment'&&field.prop==='feishuRecordId'" v-model="form.feishuRecordId" :target="form.sourceTable||'product'" value-key="feishuRecordId"/>
     <ReferenceDialog v-else-if="field.reference" v-model="form[field.prop]" :target="field.reference" :multiple="field.multiple"/>
     <el-select v-else-if="field.options" v-model="form[field.prop]" clearable><el-option v-for="option in field.options" :key="option" :label="option" :value="option"/></el-select>
     <el-date-picker v-else-if="field.type==='date'" v-model="form[field.prop]" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" clearable/>
     <AttachmentUpload v-else-if="field.type==='attachment'" :files="form.attachments||[]" editable :code="(numberProp?form[numberProp]:null)??form.id" :source-table="table" :field-name="field.label" @update:files="form.attachments=$event"/>
     <el-input v-else v-model="form[field.prop]" :type="field.type==='textarea'?'textarea':'text'" :maxlength="field.maxLength" :rows="3" :placeholder="field.prop==='boxSpec'?'长*宽*高（厘米），如60*40*30':field.numeric?'请输入数值':undefined" clearable/>
    </el-form-item></div>
   </el-form>
   <el-descriptions v-if="form.id" title="计算结果（保存后更新）" :column="2" border>
    <el-descriptions-item v-for="field in calculatedFields" :key="field.prop" :label="field.label">{{ display(form,field) }}</el-descriptions-item>
   </el-descriptions>
   <template #footer><el-button @click="dialogOpen=false">关闭</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
  </el-dialog>
 </div>
</template>
<script setup lang="ts">
import {computed,ref,reactive,watch,onMounted,onActivated,onBeforeUnmount,nextTick} from 'vue';
import {checkPermi} from '@/utils/permission';
import {onBeforeRouteLeave} from 'vue-router';
import {useWindowSize} from '@vueuse/core';
import {ElMessage,ElMessageBox} from 'element-plus';
import type {FormInstance} from 'element-plus';
import {listBusiness,getBusiness,addBusiness,editBusiness,deleteBusiness,placeBusinessRow,listRemovedBusinessFields,removeBusinessField,listBusinessCustomFields,listBusinessCustomValues,addBusinessCustomField,saveBusinessCustomValue,removeBusinessCustomField,scopeBusinessQuery,nextBusinessNumber} from '@/api/ozon/business';
import type {BusinessRow,BusinessQuery,BusinessCustomField,FilterCondition} from '@/api/ozon/business';
import {useUserStore} from '@/store/modules/user';
import {useOzonShopStore} from '@/store/modules/ozonShop';
import ColumnSettings from '../components/ColumnSettings.vue';
import {readPreference,writePreference,normalizeColumns,selectedColumns} from '../components/preferences';
import {businessConfig} from './config';
import type {BusinessField} from './config';
import {gridColumnWidth,canSumColumn,sumRowValues,formatNumericColumn} from '../components/columns';
import AttachmentUpload from '../components/AttachmentUpload.vue';
import {attachmentFiles} from '../components/attachmentFiles';
import ReferencePicker from './ReferencePicker.vue';
import ReferenceDialog from './ReferenceDialog.vue';
import ViewSelector from '../components/ViewSelector.vue';
import ViewOrdering from '../components/ViewOrdering.vue';
import FilterBuilder from '../components/FilterBuilder.vue';
import {useSavedViews,type ViewSnapshot,type ViewOrder,type SavedView} from '../components/savedViews';
import viewPresets from '../components/viewPresets.json';
const props=defineProps<{table:string}>();const config=businessConfig[props.table];
const shopStore=useOzonShopStore();
const permission=(action:string)=>'ozon:'+config.endpoint.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase())+':'+action;
const storageKey='ozon:business:v1:'+useUserStore().userId+':'+props.table;
/** 表格内新增的草稿行：不落库，确认后才提交，编号在插入时预览。 */
const NEW_ROW_KEY='__new__';
/** 各业务表的自动编号字段，与后端 OzonBusinessSupport.auto 保持一致。 */
const autoNumberProps:Record<string,string>={product:'productNo',replenishment:'replenishNo',shipment:'shipmentNo',logistics_fee:'feeNo',other_fee:'feeNo',logistics_provider:'code',payment_receipt:'code'};
const numberProp=autoNumberProps[props.table];
const saved=readPreference(storageKey);
const customFields=ref<BusinessCustomField[]>([]);
const allColumns=computed<BusinessField[]>(()=>[...config.columns,...customFields.value.map(field=>({prop:'custom_'+field.id,label:field.label,width:180,customId:field.id,numeric:field.type==='number',decimal:field.type==='number',precision:field.type==='number'?2:undefined})),{prop:'__actions',label:'操作',width:145}]);
const removedFields=ref<string[]>([]);
const activeFields=computed(()=>config.fields.filter(field=>!removedFields.value.includes(field.prop)));
const activeColumns=computed(()=>allColumns.value.filter(field=>!removedFields.value.includes(field.prop)));
const protectedFieldProps=new Set(['id','shopId','productId','purchaseId','createdAt','updatedAt','productNo','replenishNo','shipmentNo','feeNo','code','orderNo','sourceTable','feishuRecordId']);
const savedQuery=(saved.query&&typeof saved.query==='object'?saved.query:{}) as BusinessQuery;
const validColumns=new Set(config.columns.filter(f=>!f.attachment).map(f=>f.prop));
const cleanFilters=(value:unknown)=>Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([k,v])=>validColumns.has(k)&&typeof v==='string'));
/** 多维表格风格的筛选条件：运算符白名单与后端 applyCondition 一一对应。 */
const conditionOperators=new Set(['is','isNot','contains','notContains','isEmpty','isNotEmpty','gt','gte','lt','lte']);
function cleanConditions(value:unknown):FilterCondition[]{
 const seen=new Set<string>();
 return (Array.isArray(value)?value:[]).filter(item=>!!item&&typeof item==='object'&&!Array.isArray(item)).map(item=>item as Record<string,unknown>)
  .filter(item=>{
   if(typeof item.field!=='string'||!validColumns.has(item.field)||typeof item.operator!=='string'||!conditionOperators.has(item.operator)||seen.has(item.field))return false;
   seen.add(item.field);
   return true;
  })
  .slice(0,20)
  .map(item=>({field:item.field as string,operator:item.operator as string,value:item.value===undefined||item.value===null?'':String(item.value)}));
}
/** 旧视图快照的精确/包含/日期区间映射转成条件列表，保证历史设置不丢。 */
function legacyConditions(source:Record<string,any>):FilterCondition[]{
 const conditions:FilterCondition[]=[];
 for(const [field,value] of Object.entries(cleanFilters(source.equals||{})))conditions.push({field,operator:'is',value:String(value)});
 for(const [field,value] of Object.entries(cleanFilters(source.filters||{}))){
  const column=config.columns.find(item=>item.prop===field);
  conditions.push({field,operator:column?.type==='date'?'gte':column?.numeric?'is':'contains',value:String(value)});
 }
 for(const [field,value] of Object.entries(cleanFilters(source.ends||{})))conditions.push({field,operator:'lte',value:String(value)});
 return conditions;
}
function resolveConditions(source:Record<string,any>):FilterCondition[]{
 const conditions=cleanConditions(source.conditions);
 return conditions.length?conditions:legacyConditions(source);
}
const query=reactive<BusinessQuery>({pageNum:1,pageSize:[10,20,50,100].includes(Number(savedQuery.pageSize))?Number(savedQuery.pageSize):100,orderByColumn:validColumns.has(savedQuery.orderByColumn||'')?savedQuery.orderByColumn:'id',isAsc:savedQuery.isAsc==='asc'?'asc':'desc',manualOrder:savedQuery.manualOrder===true,keyword:typeof savedQuery.keyword==='string'?savedQuery.keyword:'',filters:{},ends:{},equals:{},conditions:resolveConditions(savedQuery as Record<string,any>),conjunction:savedQuery.conjunction==='or'?'or':'and'});
const initialColumns=saved.columns||{hidden:['id','createdAt','updatedAt']};
const columnState=ref(normalizeColumns(initialColumns,allColumns.value));
let customColumnsLoaded=false;
const storageWarning=ref(false);
const groups=ref<ViewOrder[]>([]),sorts=ref<ViewOrder[]>([]);
const orderColumns=computed(()=>config.columns.filter(f=>!removedFields.value.includes(f.prop)&&!f.multiple&&!f.attachment));
function cleanOrder(value:unknown,max:number):ViewOrder[]{
  const seen=new Set<string>();
  return (Array.isArray(value)?value:[]).filter(v=>v&&orderColumns.value.some(c=>c.prop===v.field)&&!seen.has(v.field)&&seen.add(v.field))
    .slice(0,max).map(v=>({field:v.field,desc:v.desc===true}));
}
function captureView():ViewSnapshot{return {query:{...query,pageNum:1},columns:columnState.value,groups:groups.value,sorts:sorts.value};}
function restoreView(snapshot:ViewSnapshot){
  const q=snapshot.query||{};
  Object.assign(query,{pageNum:1,pageSize:[10,20,50,100].includes(Number(q.pageSize))?Number(q.pageSize):100,
    orderByColumn:validColumns.has(q.orderByColumn||'')?q.orderByColumn:'id',isAsc:q.isAsc==='asc'?'asc':'desc',manualOrder:q.manualOrder===true,
    keyword:typeof q.keyword==='string'?q.keyword:'',filters:{},ends:{},equals:{},conditions:resolveConditions(q as Record<string,any>),conjunction:q.conjunction==='or'?'or':'and'});
  groups.value=query.manualOrder?[]:cleanOrder(snapshot.groups,3);
  sorts.value=query.manualOrder?[]:cleanOrder(snapshot.sorts??[{field:query.orderByColumn,desc:query.isAsc!=='asc'}],5);
  columnState.value=normalizeColumns(snapshot.columns,allColumns.value);
}
const defaults=(viewPresets as Record<string,SavedView[]>)[props.table];
const viewManager=useSavedViews(storageKey+':saved-views',defaults,captureView,restoreView);
function selectView(id:string){viewManager.select(id);search();}
async function viewAction(action:'add'|'rename'|'remove'|'reset'){if(await viewManager[action]())search();}

function persist(){viewManager.saveCurrent();}
watch(columnState,persist,{deep:true});
const visibleColumns=computed(()=>{const columns=selectedColumns(columnState.value,activeColumns.value) as BusinessField[];return draftCount.value?columns:columns.filter(field=>field.prop!=='__actions');});
const tableKey=computed(()=>JSON.stringify([columnState.value,activeColumns.value.map(f=>f.prop),groups.value,sorts.value,draftCount.value>0]));
const defaultSort=computed(()=>sorts.value.length?{prop:sorts.value[0].field,order:sorts.value[0].desc===false?'ascending' as const:'descending' as const}:{prop:'',order:null});
const allFilterFields=computed(()=>config.columns.filter(field=>!removedFields.value.includes(field.prop)&&!field.attachment&&!field.multiple));
const filterColumns=computed(()=>allFilterFields.value.filter(field=>!shopStore.selectedId||field.prop!=='shopId'));
const filterCount=computed(()=>(query.conditions||[]).filter(condition=>!shopStore.selectedId||condition.field!=='shopId').length);
const calculatedFields=computed(()=>config.columns.filter(f=>!removedFields.value.includes(f.prop)&&f.readonly));
const sourceTables=Object.fromEntries(Object.entries(businessConfig).filter(([key])=>key!=='attachment'));
const {height}=useWindowSize();const tableViewport=ref<HTMLElement>(),footerRef=ref<HTMLElement>();
const horizontalTrack=ref<HTMLElement>(),scrollContentWidth=ref(0),hasHorizontalScroll=ref(false);
let bodyScroll:HTMLElement|undefined;let scrollObserver:ResizeObserver|undefined;
function syncTrack(){const view=bodyScroll?.querySelector('.el-scrollbar__view') as HTMLElement|null;const width=view?.scrollWidth||bodyScroll?.scrollWidth||0;scrollContentWidth.value=width;hasHorizontalScroll.value=width>(bodyScroll?.clientWidth||0)+1;if(horizontalTrack.value&&bodyScroll)horizontalTrack.value.scrollLeft=bodyScroll.scrollLeft;}
function onBodyScroll(){if(horizontalTrack.value&&bodyScroll)horizontalTrack.value.scrollLeft=bodyScroll.scrollLeft;}
function onTrackScroll(){if(bodyScroll&&horizontalTrack.value)bodyScroll.scrollLeft=horizontalTrack.value.scrollLeft;}
function bindHorizontalScroll(){void nextTick(()=>{const next=tableViewport.value?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap') as HTMLElement|undefined;if(bodyScroll===next){syncTrack();return;}bodyScroll?.removeEventListener('scroll',onBodyScroll);scrollObserver?.disconnect();bodyScroll=next;if(!next)return;next.addEventListener('scroll',onBodyScroll,{passive:true});scrollObserver=new ResizeObserver(syncTrack);scrollObserver.observe(next);const view=next.querySelector('.el-scrollbar__view');if(view)scrollObserver.observe(view);syncTrack();});}
const tableHeight=ref(360);
function updateTableHeight(){void nextTick(()=>{
 const top=tableViewport.value?.getBoundingClientRect().top;
 if(top===undefined)return;
 const footerHeight=footerRef.value?.getBoundingClientRect().height??0;
 tableHeight.value=Math.max(100,Math.floor(height.value-top-footerHeight-42));
});}
watch(height,updateTableHeight);

const rows=ref<BusinessRow[]>([]),total=ref(0),loading=ref(false),error=ref('');let version=0;
async function getList(){persist();const current=++version;loading.value=true;error.value='';try{const custom=await listBusinessCustomFields(config.endpoint);if(current!==version)return;customFields.value=custom.data||[];if(!customColumnsLoaded){customColumnsLoaded=true;columnState.value=normalizeColumns(columnState.value,allColumns.value);}const removed=await listRemovedBusinessFields(config.endpoint);if(current!==version)return;removedFields.value=removed.data||[];for(const key of Object.keys(query.filters||{}))if(removedFields.value.includes(key))delete query.filters![key];for(const key of Object.keys(query.ends||{}))if(removedFields.value.includes(key))delete query.ends![key];for(const key of Object.keys(query.equals||{}))if(removedFields.value.includes(key))delete query.equals![key];query.conditions=cleanConditions((query.conditions||[]).filter(condition=>!removedFields.value.includes(condition.field)));groups.value=groups.value.filter(g=>!removedFields.value.includes(g.field));sorts.value=sorts.value.filter(g=>!removedFields.value.includes(g.field));if(removedFields.value.includes(query.orderByColumn||''))query.orderByColumn='id';const shopId=await shopStore.ensureLoaded();if(current!==version)return;const r=await listBusiness(config.endpoint,scopeBusinessQuery({...query,groupFields:groups.value.map(v=>v.field+':'+(v.desc?'desc':'asc')).join(','),sortFields:sorts.value.map(v=>v.field+':'+(v.desc?'desc':'asc')).join(',')},shopId));if(current===version){const pageRows=r.data?.rows||[];if(customFields.value.length&&pageRows.length){const values=await listBusinessCustomValues(config.endpoint,pageRows.map((row:BusinessRow)=>String(row.id)));if(current!==version)return;for(const value of values.data||[]){const row=pageRows.find((item:BusinessRow)=>String(item.id)===String(value.rowId));if(row)row['custom_'+value.fieldId]=value.value;}}rows.value=pageRows;total.value=r.data?.total||0;}}catch(cause){if(current===version){rows.value=[];total.value=0;error.value=shopStore.error||'查询失败，请检查筛选条件后重试';}}finally{if(current===version){loading.value=false;updateTableHeight();}}}
function search(){query.pageNum=1;void getList();}
function resetFilters(){query.keyword='';query.filters={};query.ends={};query.equals={};query.conditions=[];query.conjunction='and';search();}
function sortChange({prop,order}:{prop:string;order:string|null}){
  if(order)query.manualOrder=false;
  const next=order?[{field:prop,desc:order!=='ascending'}]:[];
  if(JSON.stringify(sorts.value)===JSON.stringify(next))return;
  sorts.value=next;search();
}
watch([groups,sorts],()=>{if(groups.value.length||sorts.value.length)query.manualOrder=false;},{deep:true});
const summableColumns=computed(()=>visibleColumns.value.filter(canSumColumn));
const rowNumbers=computed(()=>new Map(rows.value.map((row,index)=>[String(row.id),(query.pageNum-1)*query.pageSize+index+1])));
const displayRows=computed<BusinessRow[]>(()=>{
  const result:BusinessRow[]=[];
  const groupValues=(row:BusinessRow)=>groups.value.map(g=>String(row[g.field]??''));
  let previous:string[]=[];
  rows.value.forEach((row,index)=>{
    const values=groupValues(row);
    let changed=index===0;
    groups.value.forEach((group,level)=>{
      changed=changed||values[level]!==previous[level];
      if(!changed)return;
      const field=config.columns.find(f=>f.prop===group.field)!;
      let end=index+1;
      while(end<rows.value.length&&groupValues(rows.value[end]).slice(0,level+1).every((value,i)=>value===values[i]))end++;
      const count=end-index;
      const label=display(row,field)+' · '+count+'条';
      result.push({...sumRowValues(rows.value.slice(index,end),summableColumns.value),__key:'group:'+index+':'+level,__group:label,__groupName:display(row,field),__count:count,__groupTitle:field.label+'：'+label,__level:level});
    });
    result.push(row);previous=values;
  });
  if(drafts[NEW_ROW_KEY])result.unshift(drafts[NEW_ROW_KEY]);
  return result;
});
function summaryMethod({columns}:{columns:Array<{property?:string}>}):string[]{
 const sums=sumRowValues(rows.value,summableColumns.value);
 const first=visibleColumns.value[0]?.prop;
 return columns.map(column=>{
  if(column.property==='__rowNumber')return '';
  const field=visibleColumns.value.find(item=>item.prop===column.property);
  const value=field&&Object.prototype.hasOwnProperty.call(sums,field.prop)?'求和 '+display(sums,field):'';
  return column.property===first?'本页合计 · '+rows.value.length+'条'+(value?' · '+value:''):value;
 });
}
function rowKey(row:BusinessRow){return String(row.__key??row.id);}
function display(row:BusinessRow,field:BusinessField){let v=row[field.prop];if(field.reference){v=row[field.prop+'Label']||v;if(Array.isArray(v))return v.length?v.join('、'):'—';}if(v===null||v===undefined||v==='')return '—';if(field.customId)return String(v);if(field.numeric&&!field.reference)return formatNumericColumn(v,field);return String(v);}
const formRef=ref<FormInstance>(),dialogOpen=ref(false),saving=ref(false),editing=ref(false);const form=ref<BusinessRow>({});
const columnMenu=ref<{x:number;y:number;field:BusinessField}|null>(null);
const customColumnOpen=ref(false),customColumnSaving=ref(false),customColumnName=ref(''),customColumnType=ref<'text'|'number'>('text');
const customColumnAnchor=ref<{prop:string;side:'before'|'after'}|null>(null);
const customEdit=ref<{rowId:string;fieldId:number;value:string}|null>(null),customSaving=ref(false);
const rowMenu=ref<{x:number;y:number;row:BusinessRow}|null>(null);
const pendingInsert=ref<{anchorId:string|number;placement:'above'|'below'}|null>(null);
function closeRowMenu(){rowMenu.value=null;columnMenu.value=null;}
function onHeaderContextMenu(column:{property?:string},event:MouseEvent){const field=activeColumns.value.find(f=>f.prop===column.property&&f.prop!=='__actions');if(!field)return;event.preventDefault();rowMenu.value=null;columnMenu.value={field,x:Math.max(8,Math.min(event.clientX,window.innerWidth-230)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-230))};}
function hideColumnFromMenu(){const prop=columnMenu.value?.field.prop;closeRowMenu();if(!prop||visibleColumns.value.filter(f=>f.prop!=='__actions').length<=1)return;columnState.value=normalizeColumns({...columnState.value,hidden:[...columnState.value.hidden,prop]},allColumns.value);}
function openCustomColumn(side:'before'|'after'){const field=columnMenu.value?.field;if(!field)return;customColumnAnchor.value={prop:field.prop,side};customColumnName.value='';customColumnType.value='text';closeRowMenu();customColumnOpen.value=true;}
async function createCustomColumn(){if(customColumnSaving.value)return;const name=customColumnName.value.trim(),anchor=customColumnAnchor.value;if(!name||!anchor){ElMessage.warning('请填写字段名称');return;}if(allColumns.value.some(f=>f.label===name)){ElMessage.warning('字段名称已存在');return;}customColumnSaving.value=true;try{const response=await addBusinessCustomField(config.endpoint,{label:name,type:customColumnType.value});const field=response.data;customFields.value=[...customFields.value,field];const key='custom_'+field.id;const state=normalizeColumns(columnState.value,allColumns.value);const order=state.order.filter(prop=>prop!==key);const index=order.indexOf(anchor.prop);order.splice(index<0?order.length:index+(anchor.side==='after'?1:0),0,key);const fixed={...state.fixed};const side=state.fixed?.[anchor.prop];if(side)fixed[key]=side;columnState.value=normalizeColumns({...state,order,fixed},allColumns.value);customColumnOpen.value=false;ElMessage.success('字段已创建');await getList();}catch{ElMessage.error('创建字段失败，请检查名称或稍后重试');}finally{customColumnSaving.value=false;}}
async function deleteColumnFromMenu(){const field=columnMenu.value?.field;closeRowMenu();if(!field||(!field.customId&&(protectedFieldProps.has(field.prop)||field.multiple)))return;try{await ElMessageBox.confirm('永久删除“'+field.label+'”字段及本表全部历史值？此操作无法撤销。','删除字段',{type:'warning',confirmButtonText:'永久删除',cancelButtonText:'取消'});}catch{return;}try{if(field.customId)await removeBusinessCustomField(config.endpoint,field.customId);else await removeBusinessField(config.endpoint,field.prop);ElMessage.success('字段已永久删除');await getList();}catch{ElMessage.error('字段删除失败：系统字段或非空字段需要单独调整结构');}}
function beginCustomCell(row:BusinessRow,field:BusinessField){if(!field.customId||!checkPermi([permission('edit')])||customSaving.value)return;if(customEdit.value?.rowId===String(row.id)&&customEdit.value.fieldId===field.customId)return;customEdit.value={rowId:String(row.id),fieldId:field.customId,value:String(row[field.prop]??'')};void nextTick(()=>{const input=tableViewport.value?.querySelector('.custom-cell.is-draft input') as HTMLInputElement|null;input?.focus();input?.select();});}
async function saveCustomCell(row:BusinessRow,field:BusinessField){const draft=customEdit.value;if(!field.customId||!draft||draft.rowId!==String(row.id)||draft.fieldId!==field.customId||customSaving.value)return;customSaving.value=true;try{await saveBusinessCustomValue(config.endpoint,field.customId,String(row.id),draft.value);row[field.prop]=draft.value||null;customEdit.value=null;}catch{ElMessage.error('字段保存失败，请检查输入内容后重试');}finally{customSaving.value=false;}}
function onRowContextMenu(row:BusinessRow,_column:unknown,event:MouseEvent){if(row.__group||row.__new||(!checkPermi([permission('add')])&&!checkPermi([permission('remove')])))return;event.preventDefault();rowMenu.value={row,x:Math.max(8,Math.min(event.clientX,window.innerWidth-190)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-130))};}
function insertAtRow(placement:'above'|'below'){const row=rowMenu.value?.row;closeRowMenu();if(!row||row.__group||row.__new)return;void openAdd({anchorId:row.id,placement});}
async function deleteRowFromMenu(){const row=rowMenu.value?.row;closeRowMenu();if(!row||rowBusy[row.id])return;await removeRow(row);}
/** 新增：直接在表格里插入一行草稿行，编号即时预览，填完点右侧确认才落库。 */
async function openAdd(anchor?:{anchorId:string|number;placement:'above'|'below'}){
 if(!canAdd.value)return;
 if(drafts[NEW_ROW_KEY]){ElMessage.warning('请先确认或取消当前新增行');return;}
 pendingInsert.value=anchor??null;
 const draft:BusinessRow={id:NEW_ROW_KEY,__new:true,__key:NEW_ROW_KEY};
 for(const field of activeFields.value)draft[field.prop]=field.multiple?[]:(field.default??null);
 if(shopStore.selectedId&&activeFields.value.some(f=>f.prop==='shopId')){draft.shopId=String(shopStore.selectedId);draft.shopIdLabel=shopStore.selectedName;}
 if(props.table==='attachment')draft.sourceTable='product';
 drafts[NEW_ROW_KEY]=draft;
 if(numberProp){try{drafts[NEW_ROW_KEY][numberProp]=(await nextBusinessNumber(config.endpoint)).data;}catch{/* 预览失败不影响填写，保存时后端仍会生成编号 */}}
 await nextTick();
 (tableViewport.value?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap') as HTMLElement|null)?.scrollTo({top:0});
 (tableViewport.value?.querySelector('.business-new-row input') as HTMLInputElement|null)?.focus();
}
/** 新增行按各字段的必填与类型规则校验后提交，编号由后端最终生成。 */
async function confirmNewRow(){
 const draft=drafts[NEW_ROW_KEY];
 if(!draft||rowBusy[NEW_ROW_KEY]||!canAdd.value)return;
 const payload:BusinessRow={};
 for(const field of activeFields.value){
  const value=draft[field.prop];
  if(field.required&&(value==null||String(value).trim()===''||(Array.isArray(value)&&!value.length))){ElMessage.error('请填写'+field.label);return;}
  if(field.numeric&&!field.reference&&value!==null&&value!==undefined&&value!==''&&!/^-?\d+(\.\d+)?$/.test(String(value))){ElMessage.error(field.label+'必须是有效数值');return;}
  payload[field.prop]=value===''?null:value;
 }
 rowBusy[NEW_ROW_KEY]=true;
 let addedId:string|number|undefined;
 try{
  addedId=(await addBusiness(config.endpoint,payload)).data as string|number;
  if(pendingInsert.value&&addedId){await placeBusinessRow(config.endpoint,addedId,pendingInsert.value.anchorId,pendingInsert.value.placement);query.manualOrder=true;groups.value=[];sorts.value=[];}
  ElMessage.success('新增成功');delete drafts[NEW_ROW_KEY];pendingInsert.value=null;await getList();
 }catch{
  if(addedId){ElMessage.warning('记录已保存，但指定位置失败；请刷新后重试');delete drafts[NEW_ROW_KEY];pendingInsert.value=null;dialogOpen.value=false;await getList();}
  else ElMessage.error('保存失败，请检查必填字段');
 }finally{rowBusy[NEW_ROW_KEY]=false;}
}
function cancelNewRow(){if(rowBusy[NEW_ROW_KEY])return;delete drafts[NEW_ROW_KEY];pendingInsert.value=null;}

const canEdit=computed(()=>checkPermi([permission('edit')]));
const canAdd=computed(()=>checkPermi([permission('add')]));
const drafts=reactive<Record<string,BusinessRow>>({});
const rowBusy=reactive<Record<string,boolean>>({});
const draftCount=computed(()=>Object.keys(drafts).length);
/** 附件字段：只有配置里 type==='attachment' 的表才有，用于单元格内直接上传。 */
const attachmentField=computed(()=>activeFields.value.find(field=>field.type==='attachment'));
/** 只保留后端认识的字段，避免展示用的 image 标记混进提交体。 */
function toAttachmentPayload(value:unknown){return attachmentFiles(value).map(file=>({id:file.id,fileName:file.fileName,cosUrl:file.cosUrl}));}
function attachmentList(row:BusinessRow){const draft=drafts[row.id];return draft&&Array.isArray(draft.attachments)?draft.attachments:toAttachmentPayload(row.attachmentJson);}
function attachmentEditable(row:BusinessRow){if(!attachmentField.value||!checkPermi(['ozon:attachment:add']))return false;return row.__new?canAdd.value:canEdit.value;}
/** 附件命名用的业务编号：草稿行取即时预览的编号，取不到时返回 null（由控件退化为时间戳命名），绝不用 __new__ 当文件名。 */
function attachmentCode(row:BusinessRow){
 if(!numberProp)return row.__new?null:row.id??null;
 const draft=drafts[row.id];
 const value=(draft&&draft[numberProp])??row[numberProp];
 return value===null||value===undefined||value===''||value===NEW_ROW_KEY?null:value;
}
function attachmentTitle(row:BusinessRow){return attachmentEditable(row)?'png / jpg / webp，单张不超过 10MB；上传后需保存本行':'暂无可编辑权限';}
function setAttachments(row:BusinessRow,next:unknown[]){const draft=drafts[row.id];if(draft)draft.attachments=next;}
/** 上传前确保该行进入编辑状态：附件要挂在草稿行上暂存，保存时才写入附件表。 */
async function ensureAttachmentDraft(row:BusinessRow){
 if(row.__new)return !!drafts[NEW_ROW_KEY];
 if(drafts[row.id])return true;
 const field=attachmentField.value;
 if(!field||!editable(field,row)||rowBusy[row.id])return false;
 await beginCell(row,field);
 const draft=drafts[row.id];
 if(!draft)return false;
 if(!Array.isArray(draft.attachments))draft.attachments=toAttachmentPayload(row.attachmentJson);
 return true;
}
watch(tableKey,bindHorizontalScroll);watch(rows,bindHorizontalScroll);
function editable(field:BusinessField,row?:BusinessRow){return(row?.__new?canAdd.value:canEdit.value)&&activeFields.value.some(f=>f.prop===field.prop&&!f.readonly);}
function inputField(field:BusinessField){return activeFields.value.find(f=>f.prop===field.prop)!;}
async function beginCell(row:BusinessRow,field:BusinessField){
 if(row.__new)return;
 if(!editable(field,row)||rowBusy[row.id]||drafts[row.id])return;
 rowBusy[row.id]=true;
 try{
  const r=await getBusiness(config.endpoint,row.id);
  const value=JSON.parse(JSON.stringify(r.data));
  for(const f of activeFields.value)if(f.reference)value[f.prop]=f.multiple?(value[f.prop]||[]).map(String):value[f.prop]==null?null:String(value[f.prop]);
  drafts[row.id]=value;
 }catch{ElMessage.error('读取记录失败，请重试');}finally{rowBusy[row.id]=false;}
}
function discardRow(row:BusinessRow){if(!rowBusy[row.id])delete drafts[row.id];}
async function confirmRow(row:BusinessRow){
 const draft=drafts[row.id];if(!draft||rowBusy[row.id]||!canEdit.value)return;
 const payload:BusinessRow={id:draft.id,revision:draft.revision};
 for(const field of activeFields.value){
  const value=draft[field.prop];
  if(field.required&&(value==null||String(value).trim()===''||(Array.isArray(value)&&!value.length))){ElMessage.error('请填写'+field.label);return;}
  if(field.numeric&&!field.reference&&value!=null&&value!==''&&!/^-?\d+(\.\d+)?$/.test(String(value))){ElMessage.error(field.label+'必须是有效数值');return;}
  payload[field.prop]=value===''?null:value;
 }
 rowBusy[row.id]=true;
 try{
  await editBusiness(config.endpoint,payload);
  delete drafts[row.id];ElMessage.success('修改已保存');await getList();
 }catch{ElMessage.error('保存失败，修改已保留；若记录已被他人修改，请取消后重新编辑');}
 finally{rowBusy[row.id]=false;}
}
function warnUnsaved(event:BeforeUnloadEvent){if(draftCount.value){event.preventDefault();event.returnValue='';}}
onMounted(()=>{window.addEventListener('beforeunload',warnUnsaved);document.addEventListener('click',closeRowMenu);});
onBeforeUnmount(()=>{window.removeEventListener('beforeunload',warnUnsaved);document.removeEventListener('click',closeRowMenu);bodyScroll?.removeEventListener('scroll',onBodyScroll);scrollObserver?.disconnect();});
onBeforeRouteLeave(async()=>{
 if(!draftCount.value)return true;
 try{await ElMessageBox.confirm('还有未确认的修改，离开后将丢失。是否离开？','未保存修改',{confirmButtonText:'离开',cancelButtonText:'继续编辑',type:'warning'});return true;}catch{return false;}
});

async function save(){if(!await formRef.value?.validate().catch(()=>false))return;const payload:BusinessRow={};for(const field of activeFields.value){const value=form.value[field.prop];payload[field.prop]=value===''?null:value;if(field.numeric&&!field.reference&&value!==null&&value!==undefined&&value!==''&&!/^-?\d+(\.\d+)?$/.test(String(value))){ElMessage.error(field.label+'必须是有效数值');return;}}
 if(form.value.id){payload.id=form.value.id;payload.revision=form.value.revision;}
 saving.value=true;let addedId:string|number|undefined;try{if(payload.id)await editBusiness(config.endpoint,payload);else{const result=await addBusiness(config.endpoint,payload);addedId=result.data as string|number;}if(pendingInsert.value&&addedId){await placeBusinessRow(config.endpoint,addedId,pendingInsert.value.anchorId,pendingInsert.value.placement);query.manualOrder=true;groups.value=[];sorts.value=[];}ElMessage.success('保存成功');pendingInsert.value=null;dialogOpen.value=false;await getList();}catch{if(addedId){ElMessage.warning('记录已保存，但指定位置失败；请刷新后重试');pendingInsert.value=null;dialogOpen.value=false;await getList();}else ElMessage.error('保存失败，请检查必填字段');}finally{saving.value=false;}}
async function removeRow(row:BusinessRow){const current=await getBusiness(config.endpoint,row.id);try{await ElMessageBox.confirm('确认删除这条'+config.title+'记录？有关联记录时系统会阻止删除。','删除确认',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'});}catch{return;}await deleteBusiness(config.endpoint,row.id,current.data.revision);delete drafts[row.id];ElMessage.success('删除成功');await getList();}
watch(()=>shopStore.selectionKey,()=>{version++;rows.value=[];total.value=0;query.pageNum=1;void getList();});
onMounted(()=>{updateTableHeight();bindHorizontalScroll();void getList();});let activated=false;onActivated(()=>{updateTableHeight();if(activated)void getList();activated=true;});
</script>
<style scoped>
/* 分组和本页合计保留各列，数值对齐到原列。 */
.business-view{padding-top:0}
.group-cell{display:inline-flex;align-items:baseline;gap:8px;white-space:nowrap}.group-name{font-size:14px;font-weight:600;color:var(--el-text-color-primary)}.group-name-secondary{font-size:13px;font-weight:400}.group-count{font-size:12px;font-weight:400;color:var(--el-text-color-secondary)}.group-sum{display:inline-flex;gap:4px;align-items:baseline;font-variant-numeric:tabular-nums}.sum-prefix{font-size:12px;font-weight:400;color:var(--el-text-color-secondary)}.sum-value{font-size:13px;font-weight:400;color:var(--el-text-color-primary)}
.business-view :deep(.business-group-row td.el-table__cell){background:var(--el-fill-color-light)!important}
.business-view :deep(.business-new-row td.el-table__cell){background:var(--el-color-primary-light-9)!important}
.business-view :deep(.business-new-row .row-number-column){color:var(--el-color-primary);font-weight:600}

.editable-cell{min-height:24px;cursor:text;display:flex;align-items:center}.editable-cell:hover{background:var(--el-color-primary-light-9)}.editable-cell.is-draft{background:var(--el-color-warning-light-9)}.editable-cell.is-new-cell{background:none}.editable-cell.is-new-cell:hover{background:var(--el-color-primary-light-8)}.attachment-cell{cursor:default;gap:4px}.editable-cell :deep(.el-input),.editable-cell :deep(.el-select),.editable-cell :deep(.el-date-editor){width:100%;min-width:0}.editable-cell :deep(.el-input__wrapper){padding:1px 4px}

.preset-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0}.preset-filters-label{font-size:12px;color:var(--el-text-color-secondary)}.business-view :deep(.business-group-row){--el-table-tr-bg-color:var(--el-fill-color-light);font-weight:400}
.toolbar,.actions,.row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.toolbar.business-toolbar{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto}.business-toolbar .actions,.business-toolbar .count{flex:none}.business-toolbar .actions{flex-wrap:nowrap}.business-toolbar .count{margin-right:0;white-space:nowrap}.business-view :deep(.el-card__header){padding:6px 12px}.business-view :deep(.el-card__body){padding:2px 12px 12px}.toolbar{justify-content:space-between}.count{font-size:12px;color:var(--el-text-color-secondary);margin-right:auto}.filters{max-height:60vh;overflow:auto;padding:4px 8px}.filters .el-form{margin-top:14px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px}.form-grid :deep(.el-select),.form-grid :deep(.el-date-editor){width:100%}.row-actions{flex-wrap:nowrap;gap:2px}.row-actions :deep(.el-button){margin:0}.business-view :deep(.ozon-data-grid){--ozon-grid-text:#1f2329;--ozon-grid-heading:#1f2329;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Tahoma,'PingFang SC','Microsoft YaHei',Arial,'Hiragino Sans GB',sans-serif;font-size:14px;font-weight:400;line-height:20px;color:var(--ozon-grid-text);--el-table-text-color:var(--ozon-grid-text);--el-table-header-text-color:var(--ozon-grid-heading)}
:global(html.dark) .business-view :deep(.ozon-data-grid){--ozon-grid-text:var(--el-text-color-primary);--ozon-grid-heading:var(--el-text-color-primary)}
.business-view :deep(.ozon-data-grid th.el-table__cell){padding:0;font-size:12px;font-weight:600;color:var(--ozon-grid-heading)}
/* 上游 vendors/_table.scss 用 !important 把表头钉死在 40px，这里按多维表格「低」行高（32px，表头与数据行同高）对齐并保持覆盖。 */
.business-view :deep(.ozon-data-grid .el-table__header-wrapper th.el-table__cell){height:32px!important}
.business-view :deep(.ozon-data-grid td.el-table__cell){height:32px;padding:0}
.business-view :deep(.ozon-data-grid .attachment-images){min-height:24px;padding:0;flex-wrap:nowrap;overflow:hidden}
.business-view :deep(.ozon-data-grid .attachment-thumbnail){width:24px;height:24px;flex-basis:24px}
.business-view :deep(.ozon-data-grid .cell){padding:0 10px;line-height:20px;font-variant-numeric:tabular-nums}
.business-view :deep(.ozon-data-grid th .cell){white-space:nowrap;overflow:hidden;text-overflow:clip;line-height:18px;max-height:18px}
.business-pagination :deep(.pagination-container){margin-top:0;padding-top:0;min-height:18px;height:18px;border-top:0}
.business-pagination :deep(.el-pagination){--el-pagination-font-size:11px;--el-pagination-button-height:18px;--el-pagination-button-width:18px;gap:3px;height:18px;line-height:18px;font-size:11px}
.business-pagination :deep(.el-pagination .btn-prev),.business-pagination :deep(.el-pagination .btn-next),.business-pagination :deep(.el-pagination .el-pager li){min-width:18px;height:18px;line-height:18px;font-size:11px}
.business-pagination :deep(.el-pagination .el-pagination__total),.business-pagination :deep(.el-pagination .el-pagination__jump){height:18px;line-height:18px;font-size:11px}
.business-pagination :deep(.el-pagination .el-pagination__sizes .el-select__wrapper),.business-pagination :deep(.el-pagination .el-pagination__sizes .el-input__wrapper),.business-pagination :deep(.el-pagination .el-pagination__jump .el-input__wrapper){min-height:18px;height:18px;font-size:11px}
.business-pagination :deep(.el-pagination input){height:18px;font-size:11px}
.business-view :deep(.ozon-data-grid .el-table__footer-wrapper td.el-table__cell){background:var(--el-fill-color-light);height:28px;padding:0;font-family:inherit;font-size:13px;font-weight:400;line-height:20px;color:var(--el-text-color-primary)}
.business-view :deep(.ozon-data-grid .el-table__footer-wrapper .cell){line-height:20px}
.business-view :deep(.ozon-data-grid .el-table__footer-wrapper td.el-table__cell:nth-child(2)){font-weight:400}
.menu-title{padding:6px 12px;color:var(--el-text-color-secondary);font-size:12px;border-bottom:1px solid var(--el-border-color-lighter)}.grid-context-menu{position:fixed;z-index:3000;min-width:170px;padding:4px;background:var(--el-bg-color-overlay);border:1px solid var(--el-border-color-light);border-radius:6px;box-shadow:var(--el-box-shadow-light)}.grid-context-menu button{display:block;width:100%;padding:8px 12px;text-align:left;background:none;border:0;color:var(--el-text-color-primary);cursor:pointer;font:inherit}.grid-context-menu button:hover{background:var(--el-fill-color-light)}.grid-context-menu button:disabled{color:var(--el-text-color-placeholder);cursor:not-allowed}.grid-context-menu .danger-action{color:var(--el-color-danger)}.grid-context-menu small{display:block;padding:4px 12px;color:var(--el-text-color-secondary);font-size:11px}.field-heading{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.field-type-icon{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1px solid var(--el-border-color);border-radius:3px;font-size:11px;font-weight:600;color:var(--el-color-primary);line-height:1}.field-type-formula{font-family:Georgia,serif;font-style:italic}.horizontal-track{height:16px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.business-view :deep(.ozon-data-grid .el-scrollbar__bar.is-horizontal){display:none}.business-view :deep(.ozon-data-grid .row-number-column){color:var(--el-text-color-secondary);font-size:12px}.business-view :deep(.ozon-data-grid .caret-wrapper){display:none}
.business-view :deep(.ozon-data-grid .el-input__wrapper),.business-view :deep(.ozon-data-grid .el-select__wrapper){min-height:28px}
.business-view :deep(.ozon-data-grid .el-input__inner),.business-view :deep(.ozon-data-grid .el-select__selected-item),.business-view :deep(.ozon-data-grid .el-button){font-family:inherit}
.business-view :deep(.ozon-data-grid .el-input__inner),.business-view :deep(.ozon-data-grid .el-select__selected-item){font-size:14px}
@media(max-width:600px){.form-grid{grid-template-columns:1fr}.business-toolbar :deep(.saved-views){min-width:160px}}
</style>
