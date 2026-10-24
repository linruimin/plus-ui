import raw from './config.json';
import type { ReportColumn } from '../components/columns';
export interface BusinessField extends ReportColumn { type?:string; required?:boolean; reference?:string; multiple?:boolean; maxLength?:number; options?:string[]; default?:string|number; readonly?:boolean; sql?:string; customId?:number; chip?:boolean }
export interface BusinessConfig { title:string; endpoint:string; fields:BusinessField[]; columns:BusinessField[] }
export const businessConfig = raw as Record<string,BusinessConfig>;
export function recordLabel(row:Record<string,any>) {
 return [row.name || row.orderNo || row.shipmentNo || row.feeNo || row.productNo || row.replenishNo || row.code || row.fileName || ('记录 '+row.id),row.sku, row.feeType].filter(Boolean).join(' · ')+' (#'+row.id+')';
}
/** 选择弹窗回填后显示的短标签：编号优先，并带上最能区分的辅助列。
 *  ⚠️ target='shipment' 只给编号：出货订单列本身已用灰色标签展示编号，再拼品名会撑爆单元格
 *  （2026-10-24 用户要求「只要编号，别跟一个点加另一个数据」）。 */
export function shortLabel(row:Record<string,any>|null|undefined,target?:string) {
 if (!row) return '';
 const primary = row.orderNo || row.shipmentNo || row.productNo || row.replenishNo || row.feeNo || row.code || row.name || row.fileName || ('记录 '+row.id);
 if (target === 'shipment') return primary;
 const extra = target === 'purchase_order' ? (row.productIdLabel || row.name) : (row.name && row.name !== primary ? row.name : row.sku);
 return [primary, extra].filter(Boolean).join(' · ');
}
