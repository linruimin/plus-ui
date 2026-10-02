import type { ReportColumn } from './columns';
import type { ReportQuery } from '@/api/ozon/report/types';

export interface ColumnPreference { order: string[]; hidden: string[]; fixed?: Record<string, 'left' | 'right'> }

/** 只保存视图偏好；损坏或不可用的本地存储不会影响报表查询。 */
export function readPreference(key: string): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function writePreference(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function normalizeColumns(value: unknown, columns: ReportColumn[]): ColumnPreference {
  const saved = value && typeof value === 'object' ? value as Partial<ColumnPreference> : {};
  const keys = columns.map(column => column.prop);
  const savedOrder = Array.isArray(saved.order) ? saved.order.filter(key => keys.includes(key)) : [];
  const order = [...new Set([...savedOrder, ...keys])];
  // 老视图首次出现新列时，按列定义插回相邻位置（如图片、品名），之后尊重用户自己的列顺序。
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (savedOrder.includes(key)) continue;
    const previous = keys[index - 1];
    order.splice(order.indexOf(key), 1);
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, key);
  }
  const hidden = Array.isArray(saved.hidden) ? [...new Set(saved.hidden.filter(key => keys.includes(key)))] : [];
  if (hidden.length === keys.length && keys.length) hidden.splice(hidden.indexOf(order[0]), 1);
  const fixed: Record<string, 'left' | 'right'> = {};
  for (const key of keys) {
    const side = saved.fixed?.[key];
    if (side === 'left' || side === 'right') fixed[key] = side;
  }
  if (keys.includes('__actions')) {
    order.splice(order.indexOf('__actions'), 1); order.push('__actions');
    const index = hidden.indexOf('__actions'); if (index >= 0) hidden.splice(index, 1);
    fixed.__actions = 'right';
  }
  if (keys.some(key => key !== '__actions') && keys.filter(key => key !== '__actions').every(key => hidden.includes(key))) {
    hidden.splice(hidden.indexOf(order.find(key => key !== '__actions')!), 1);
  }
  return { order, hidden, fixed };
}
export function selectedColumns(value: ColumnPreference, columns: ReportColumn[]): ReportColumn[] {
  const safe = normalizeColumns(value, columns);
  const rank = (key: string) => key === '__actions' ? 3 : safe.fixed?.[key] === 'left' ? 0 : safe.fixed?.[key] === 'right' ? 2 : 1;
  return safe.order.filter(key => !safe.hidden.includes(key)).sort((a, b) => rank(a) - rank(b))
    .map(key => ({ ...columns.find(column => column.prop === key)!, fixed: safe.fixed?.[key] }));
}
export function normalizeQuery(value: unknown, columns: ReportColumn[], defaults: ReportQuery): ReportQuery {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const query = { ...defaults, pageNum: 1 };
  for (const key of ['sellerSku', 'ozonSku', 'productName', 'reportMonth', 'accrualId', 'applicationNo', 'status'] as const) {
    const text = saved[key];
    if (typeof text === 'string' && text.length <= (({ accrualId: 32, applicationNo: 64, productName: 200, ozonSku: 20 } as Record<string, number>)[key] ?? 255)) query[key] = text;
  }
  if (query.ozonSku && !/^\d{1,20}$/.test(query.ozonSku)) delete query.ozonSku;
  if (query.reportMonth && !validDate(query.reportMonth)) delete query.reportMonth;
  if (typeof saved.orderByColumn === 'string' && columns.some(column => column.prop === saved.orderByColumn)) query.orderByColumn = saved.orderByColumn;
  if (saved.isAsc === 'asc' || saved.isAsc === 'desc') query.isAsc = saved.isAsc;
  if ([10, 20, 50, 100].includes(Number(saved.pageSize))) query.pageSize = Number(saved.pageSize);
  return query;
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function normalizeDates(value: unknown): string[] {
  return Array.isArray(value) && value.length === 2 && value.every(date => typeof date === 'string' && validDate(date)) && value[0] <= value[1] ? [...value] : [];
}

/** 分组标题只合并同一固定区域，避免跨固定列的单元格遮挡。 */
export function groupSpan(columns: ReportColumn[], index: number): number[] {
  const first = columns[0];
  if (!first) return [1, 1];
  let count = 0;
  for (const column of columns) {
    if (column.prop === '__actions' || column.fixed !== first.fixed) break;
    count++;
  }
  count = Math.max(1, count);
  return index === 0 ? [1, count] : index < count ? [0, 0] : [1, 1];
}
