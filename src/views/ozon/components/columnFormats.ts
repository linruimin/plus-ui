/**
 * 列显示格式的持久化 —— **按菜单（同一张表）共享，不跟着视图走**。
 *
 * 用户 2026-10-08 要求对齐飞书多维表格：字段的显示格式属于字段本身，一个菜单下的**所有视图**都生效。
 * 原来存在每个视图快照的 `columns.formats` 里 → 在「按产品」视图设成「只显示年月日」，
 * 切到「全部」就退回带时分秒（实测复现）。
 *
 * key = `ozon:column-format:v1:{userId}:{table}`（业务表 table 用 props.table，报表页用 preferenceKey/kind）
 * 迁移：首次读取时把老快照里的视图级 formats 合并成一份菜单级格式，用户之前设过的不丢。
 */
import type { ColumnFormat, ReportColumn } from './columns';
import { normalizeColumns, readPreference, writePreference } from './preferences';

export function columnFormatKey(userId: string | number, table: string): string {
  return 'ozon:column-format:v1:' + userId + ':' + table;
}

/** 只保留列定义里存在的 prop，并清掉非法值（复用列设置的校验逻辑，避免两份实现走偏）。 */
export function sanitizeFormats(value: unknown, columns: ReportColumn[]): Record<string, ColumnFormat> {
  return normalizeColumns({ formats: value as Record<string, ColumnFormat> | undefined }, columns).formats || {};
}

export function readColumnFormats(key: string, columns: ReportColumn[]): Record<string, ColumnFormat> {
  return sanitizeFormats(readPreference(key).formats, columns);
}

/** 写盘时带上 migrated 标记：用户把格式全恢复默认后，下次加载不会再被老视图快照搬回来。 */
export function writeColumnFormats(key: string, formats: Record<string, ColumnFormat>): boolean {
  return writePreference(key, { formats, migrated: true });
}

export function columnFormatsMigrated(key: string): boolean {
  return readPreference(key).migrated === true;
}

/**
 * 迁移用：把「每个视图快照各存一份」的 formats 合并成菜单级格式。
 * 同一列在多个视图里格式不同时，按 `activeId`（用户上次停留的视图）优先，其余按快照出现顺序。
 * 没有任何格式时返回 null（表示无需迁移）。
 */
export function migrateViewFormats(savedViewsKey: string, columns: ReportColumn[]): Record<string, ColumnFormat> | null {
  const saved = readPreference(savedViewsKey);
  const snapshots = saved.snapshots && typeof saved.snapshots === 'object' && !Array.isArray(saved.snapshots)
    ? saved.snapshots as Record<string, unknown> : {};
  const ids: string[] = [];
  const push = (id: unknown) => { if (typeof id === 'string' && ids.indexOf(id) < 0 && snapshots[id]) ids.push(id); };
  push(saved.activeId);
  for (const id of Object.keys(snapshots)) push(id);
  const merged: Record<string, ColumnFormat> = {};
  for (const id of ids) {
    const snapshot = snapshots[id];
    if (!snapshot || typeof snapshot !== 'object') continue;
    const raw = (snapshot as Record<string, unknown>).columns;
    if (!raw || typeof raw !== 'object') continue;
    const clean = sanitizeFormats((raw as Record<string, unknown>).formats, columns);
    for (const prop of Object.keys(clean)) if (merged[prop] === undefined) merged[prop] = clean[prop];
  }
  return Object.keys(merged).length ? merged : null;
}
