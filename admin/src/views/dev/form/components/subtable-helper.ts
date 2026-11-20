import type { DevFormSubTable, DevSubTableColumn } from '@/types/dev';

export type SubTableRow = Record<string, any> & { id?: number };

/**
 * 明细展示列：**顺序永远跟设计器里明细列的拖拽顺序（columns）走**，
 * `listFields` 只决定"显示哪些列"，不参与排序（它是随列自动维护的集合，
 * 历史上不随拖拽更新顺序，直接按它排会跟设计器里看到的顺序不一致）。
 */
export function detailColumnsOf(subtable: DevFormSubTable): DevSubTableColumn[] {
  const all = subtable.columns ?? [];
  const configured = subtable.listFields ?? [];
  if (configured.length === 0) return all;
  const picked = new Set(configured);
  const filtered = all.filter((column) => picked.has(column.columnName));
  return filtered.length > 0 ? filtered : all;
}

/**
 * 明细行校验：只校验 visible 且 required 的字段，与设计器第 3 步的标记保持一致。
 * 返回可直接提示给用户的文案，null 表示通过。
 */
export function subTableRowError(
  subtable: DevFormSubTable,
  row: SubTableRow,
): string | null {
  for (const column of subtable.columns ?? []) {
    if (!column.required || column.visible === false) continue;
    const value = row[column.name];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);
    if (empty) return `请填写${column.label}`;
  }
  return null;
}

/** 整组明细校验，带行号，保持与后端错误提示一致 */
export function subTableValidateRows(
  subtable: DevFormSubTable,
  rows: SubTableRow[],
): string | null {
  for (const [index, row] of rows.entries()) {
    const error = subTableRowError(subtable, row);
    if (error) return `明细「${subtable.label}」第 ${index + 1} 行：${error}`;
  }
  return null;
}

/** 提交给后端的明细数据：去掉本地编辑标记与只读时间戳 */
export function subTablePayload(rows: SubTableRow[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    delete copy.__key;
    delete copy.__isNew;
    delete copy.createdAt;
    delete copy.updatedAt;
    return copy;
  });
}
