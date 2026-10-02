import request from '@/utils/request';
import type { AxiosPromise } from '@/utils/api-types';
import type { PageResult } from '@/api/types';
export type BusinessRow = Record<string, any>;
/** 多维表格风格的筛选条件：字段 + 运算符 + 值。 */
export interface FilterCondition { field:string; operator:string; value?:string }
export interface BusinessQuery extends PageQuery { scopeShopId?:string; manualOrder?:boolean; orderByColumn?:string; isAsc?:string; keyword?: string; equals?: Record<string,string>; sortFields?:string; groupFields?:string; filters?: Record<string,string>; ends?: Record<string,string>; conditions?:FilterCondition[]; conjunction?:'and'|'or' }
export const listBusiness = (endpoint:string, params:BusinessQuery):AxiosPromise<PageResult<BusinessRow>> => {
 const { conditions, ...rest } = params;
 return request({ url:'/ozon/business/'+endpoint+'/list',method:'get',params:{...rest,conditions:conditions&&conditions.length?JSON.stringify(conditions):undefined} });
};
export const getBusiness = (endpoint:string,id:string|number):AxiosPromise<BusinessRow> => request({url:'/ozon/business/'+endpoint+'/'+id,method:'get'});
export const addBusiness = (endpoint:string,data:BusinessRow) => request({url:'/ozon/business/'+endpoint,method:'post',data});
export const editBusiness = (endpoint:string,data:BusinessRow) => request({url:'/ozon/business/'+endpoint,method:'put',data});
export interface BusinessCustomField { id:number; label:string; type:'text'|'number' }
export interface BusinessCustomValue { fieldId:number; rowId:string|number; value:string }
export const listBusinessCustomFields = (endpoint:string):AxiosPromise<BusinessCustomField[]> => request({url:'/ozon/business/custom-fields/'+endpoint,method:'get'});
export const listBusinessCustomValues = (endpoint:string,ids:(string|number)[]):AxiosPromise<BusinessCustomValue[]> => request({url:'/ozon/business/custom-fields/'+endpoint+'/values',method:'post',data:ids});
export const addBusinessCustomField = (endpoint:string,data:{label:string;type:'text'|'number'}):AxiosPromise<BusinessCustomField> => request({url:'/ozon/business/custom-fields/'+endpoint,method:'post',data});
export const saveBusinessCustomValue = (endpoint:string,fieldId:number,rowId:string|number,value:string) => request({url:'/ozon/business/custom-fields/'+endpoint+'/'+fieldId+'/rows/'+rowId,method:'put',data:{value}});
export const removeBusinessCustomField = (endpoint:string,fieldId:number) => request({url:'/ozon/business/custom-fields/'+endpoint+'/'+fieldId,method:'delete'});
export const listRemovedBusinessFields = (endpoint:string):AxiosPromise<string[]> => request({url:'/ozon/business/removed-fields/'+endpoint,method:'get'});
export const removeBusinessField = (endpoint:string,prop:string) => request({url:'/ozon/business/removed-fields/'+endpoint+'/'+encodeURIComponent(prop),method:'delete'});
export const placeBusinessRow = (endpoint:string,rowId:string|number,anchorId:string|number,placement:'above'|'below') => request({url:'/ozon/business/row-position/'+endpoint,method:'post',data:{rowId,anchorId,placement}});
export const deleteBusiness = (endpoint:string,id:string|number,revision:string) => request({url:'/ozon/business/'+endpoint+'/'+id,method:'delete',params:{revision}});
/** 表格内新增行时预览即将分配的编号（日期+三位序号），保存时由后端最终确定。 */
export const nextBusinessNumber = (endpoint:string):AxiosPromise<number> => request({url:'/ozon/business/number/'+endpoint,method:'get'});
export interface BusinessAttachmentUpload { fileName:string; cosKey:string; cosUrl:string; sizeBytes:number; mimeType:string }
/** 业务图片上传：选图即传对象存储，此时业务记录可能还不存在，登记在保存记录时一并完成。 */
export const uploadBusinessAttachment = (file:File, params:{sourceTable:string; fieldName:string; fileName:string}):AxiosPromise<BusinessAttachmentUpload> => {
 const data = new FormData();
 data.append('file', file);
 data.append('sourceTable', params.sourceTable);
 data.append('fieldName', params.fieldName);
 data.append('fileName', params.fileName);
 return request({url:'/ozon/business/attachment/upload', method:'post', data, headers:{repeatSubmit:false}});
};


/** 全局店铺覆盖视图原有的店铺条件，其余筛选保留；不修改视图快照。 */
export function scopeBusinessQuery(params:BusinessQuery, scopeShopId?:string):BusinessQuery {
 const result={...params,filters:{...params.filters},equals:{...params.equals},conditions:(params.conditions||[]).map(condition=>({...condition}))};
 delete result.scopeShopId;
 if(scopeShopId){
  result.scopeShopId=scopeShopId;
  delete result.filters.shopId;
  delete result.equals.shopId;
  result.conditions=result.conditions.filter(condition=>condition.field!=='shopId');
 }
 return result;
}
