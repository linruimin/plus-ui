<template>
  <div class="attachment-images" :class="{'is-busy':uploading}" @click.stop>
    <span v-for="(file,index) in items" :key="file.id ?? file.cosUrl" class="attachment-item">
      <el-image v-if="isImage(file)" class="attachment-thumbnail" :src="file.cosUrl" :alt="file.fileName" :title="file.fileName + ' · 点击放大'" fit="contain" loading="lazy" :preview-src-list="previewUrls" :initial-index="previewUrls.indexOf(file.cosUrl)" preview-teleported hide-on-click-modal>
        <template #error><span class="image-error">图片不可用</span></template>
      </el-image>
      <a v-else class="attachment-link" :href="file.cosUrl" target="_blank" rel="noopener noreferrer" :title="file.fileName">{{ file.fileName }}</a>
      <el-button v-if="editable" class="attachment-remove" link type="danger" icon="Close" :disabled="uploading" :title="'移除 ' + file.fileName" @click.stop="remove(index)"/>
    </span>
    <el-upload v-if="editable" class="attachment-picker" :show-file-list="false" :multiple="true" :accept="accept" :disabled="uploading" :http-request="upload">
      <el-button class="attachment-add" link type="primary" icon="Plus" :loading="uploading" :title="hint" :aria-label="hint"/>
    </el-upload>
    <span v-if="!items.length && !editable" class="no-attachment">—</span>
  </div>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import {ElMessage} from 'element-plus';
import type {UploadRequestOptions} from 'element-plus';
import {uploadBusinessAttachment} from '@/api/ozon/business';
/** 附件项：已登记的带 id，本次新上传的只有对象信息。 */
interface AttachmentItem{id?:string|number;fileName:string;cosKey?:string;cosUrl:string;sizeBytes?:number;mimeType?:string}
const props=defineProps<{files?:AttachmentItem[];editable?:boolean;code?:string|number|null;sourceTable:string;fieldName:string;ensureDraft?:()=>Promise<boolean>|boolean;applyFiles?:(files:AttachmentItem[])=>void}>();
const emit=defineEmits<{'update:files':[AttachmentItem[]]}>();
/** 结果通道一：事件（弹窗用）。通道二：applyFiles 父组件回调（表格单元格用）——
 *  单元格所在行一旦进入草稿态，表格可能整体重建把本组件卸载，此时 Vue 会直接丢弃
 *  已卸载实例的 emit（runtime-core 的 `if (instance.isUnmounted) return`），回调不受影响。 */
function commit(next:AttachmentItem[]){emit('update:files',next);props.applyFiles?.(next);}
/** 允许的图片类型与扩展名，与后端 OzonBizAttachmentServiceImpl 保持一致。 */
const types:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const accept='image/png,image/jpeg,image/webp';
const maxBytes=10*1024*1024;
const uploading=ref(false);
/** 本次编辑已发出的文件名，避免多选连传时因属性未及时回流而重名覆盖。 */
const issued:string[]=[];
const items=computed<AttachmentItem[]>(()=>props.files||[]);
const previewUrls=computed(()=>items.value.filter(isImage).map(file=>file.cosUrl));
const hint='上传图片（png / jpg / webp，单张不超过 10MB）';
function isImage(file:AttachmentItem){
 const mime=typeof file.mimeType==='string'?file.mimeType.toLowerCase():'';
 if(mime)return mime.startsWith('image/');
 return /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i.test(String(file.fileName||file.cosUrl||''));
}
function extensionOf(file:File){
 const type=(file.type||'').toLowerCase().split(';')[0];
 if(types[type])return types[type];
 const matched=/\.(png|jpe?g|webp)$/i.exec(file.name||'');
 return matched?matched[1].toLowerCase().replace('jpeg','jpg'):null;
}
/** 沿用「编号.扩展名」「编号_N.扩展名」的命名习惯，并按历史附件数量顺延。 */
function allocateName(extension:string){
 const code=props.code===null||props.code===undefined||props.code===''?Date.now():String(props.code);
 const taken=new Set<string>([...items.value.map(file=>file.fileName),...issued]);
 for(let attempt=1;;attempt++){
  const name=attempt===1?`${code}.${extension}`:`${code}_${attempt}.${extension}`;
  if(!taken.has(name)){issued.push(name);return name;}
 }
}
async function upload(options:UploadRequestOptions){
 const file=options.file as File;
 const extension=extensionOf(file);
 if(!extension){ElMessage.error('只支持 png、jpg、webp 格式的图片');return;}
 if(file.size>maxBytes){ElMessage.error('单张图片不能超过 10MB');return;}
 if(!props.editable){ElMessage.warning('请先保存或取消当前未确认的修改');return;}
 const fileName=allocateName(extension);
 uploading.value=true;
 try{
  if(props.ensureDraft&&!(await props.ensureDraft())){ElMessage.warning('当前记录无法开始编辑，请刷新后重试');return;}
  const response=await uploadBusinessAttachment(file,{sourceTable:props.sourceTable,fieldName:props.fieldName,fileName});
  const data=response.data||{} as AttachmentItem;
  commit([...items.value,{fileName:data.fileName||fileName,cosKey:data.cosKey,cosUrl:data.cosUrl,sizeBytes:data.sizeBytes,mimeType:data.mimeType}]);
  ElMessage.success('图片已上传，保存后生效');
 }catch{
  ElMessage.error('图片上传失败，请重试');
 }finally{
  uploading.value=false;
 }
}
function remove(index:number){
 if(!props.editable||uploading.value)return;
 const next=items.value.slice();
 next.splice(index,1);
 commit(next);
}
</script>
<style scoped>
.attachment-images{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:2px 0;min-height:24px}
.attachment-item{position:relative;display:inline-flex;align-items:center}
.attachment-thumbnail{width:24px;height:24px;flex:0 0 24px;border:1px solid var(--el-border-color-lighter);border-radius:3px;cursor:zoom-in;background:var(--el-fill-color-light)}
.attachment-link{max-width:100%;overflow-wrap:anywhere;color:var(--el-color-primary);font-size:12px}
.attachment-remove{position:absolute;top:-6px;right:-6px;padding:0;height:14px;width:14px;font-size:10px;background:var(--el-bg-color-overlay);border:1px solid var(--el-border-color-lighter);border-radius:50%;z-index:1}
.attachment-picker{display:inline-flex}
.attachment-add{padding:0;height:22px}
.image-error{font-size:10px;line-height:12px;color:var(--el-text-color-secondary);text-align:center}
.no-attachment{color:var(--el-text-color-placeholder)}
</style>
