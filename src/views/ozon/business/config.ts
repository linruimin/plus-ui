import raw from './config.json';
import type { ReportColumn } from '../components/columns';
export interface BusinessField extends ReportColumn { type?:string; required?:boolean; reference?:string; multiple?:boolean; maxLength?:number; options?:string[]; default?:string|number; readonly?:boolean; sql?:string; customId?:number }
export interface BusinessConfig { title:string; endpoint:string; fields:BusinessField[]; columns:BusinessField[] }
export const businessConfig = raw as Record<string,BusinessConfig>;
export function recordLabel(row:Record<string,any>) {
 return [row.name || row.orderNo || row.shipmentNo || row.feeNo || row.productNo || row.replenishNo || row.code || row.fileName || ('记录 '+row.id),row.sku, row.feeType].filter(Boolean).join(' · ')+' (#'+row.id+')';
}
/** 选择弹窗回填后显示的短标签：编号优先，并带上最能区分的辅助列。 */
export function shortLabel(row:Record<string,any>|null|undefined,target?:string) {
 if (!row) return '';
 const primary = row.orderNo || row.shipmentNo || row.productNo || row.replenishNo || row.feeNo || row.code || row.name || row.fileName || ('记录 '+row.id);
 const extra = target === 'purchase_order' ? (row.productIdLabel || row.name) : (row.name && row.name !== primary ? row.name : row.sku);
 return [primary, extra].filter(Boolean).join(' · ');
}
