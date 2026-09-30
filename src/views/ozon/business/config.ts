import raw from './config.json';
import type { ReportColumn } from '../components/columns';
export interface BusinessField extends ReportColumn { type?:string; required?:boolean; reference?:string; multiple?:boolean; maxLength?:number; options?:string[]; default?:string|number; readonly?:boolean; sql?:string; customId?:number }
export interface BusinessConfig { title:string; endpoint:string; fields:BusinessField[]; columns:BusinessField[] }
export const businessConfig = raw as Record<string,BusinessConfig>;
export function recordLabel(row:Record<string,any>) {
 return [row.name || row.orderNo || row.shipmentNo || row.feeNo || row.productNo || row.replenishNo || row.code || row.fileName || ('记录 '+row.id),row.sku, row.feeType].filter(Boolean).join(' · ')+' (#'+row.id+')';
}
