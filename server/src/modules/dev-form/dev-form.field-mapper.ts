import type { DbColumnInfo } from '../dev-db-table/dev-db-table.introspect';
import type { DevModelFieldInput } from '../dev-model/dev-model.dto';
import type { DevFieldType } from './dev-form.dto';

export const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);

/**
 * 数据库列 → 建模字段（代码生成用）。
 * 字段名优先取表单里配的 camelCase 名，保证接口字段名与表单控件绑定的 key 一致。
 */
export function generateTableFields(
  columns: DbColumnInfo[],
  nameByColumn?: Map<string, string>,
): DevModelFieldInput[] {
  return columns
    .filter((column) => !SYSTEM_COLUMNS.has(column.columnName) && column.supported && column.type)
    .map((column) => ({
      label: column.comment || column.columnName,
      columnName: column.columnName,
      fieldName: nameByColumn?.get(column.columnName) || toCamel(column.columnName),
      type: column.type as NonNullable<DbColumnInfo['type']>,
      length: column.length || 255,
      precision: column.precision || 10,
      scale: column.scale ?? 2,
      nullable: column.nullable,
      unique: false,
      listVisible: true,
      formVisible: true,
      searchable: ['varchar', 'text'].includes(column.type as string),
    }));
}

export function toCamel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.charAt(0).toLowerCase() + part.slice(1) : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** 数据库列可选择的表单组件类型 */
export function allowedFormTypes(column: DbColumnInfo): DevFieldType[] {
  if (column.type === 'varchar') {
    return [
      'input',
      'textarea',
      'select',
      'radio',
      'checkbox',
      'color',
      'file',
      'image',
      'qrcode',
      'barcode',
      'relationForm',
      'dialogSelect',
      'userSelect',
      'roleSelect',
    ];
  }
  // 弹框选择器把 {v,l} 序列化成 JSON 文本，只能落在字符串列，数值列写不进去
  if (column.type === 'text')
    return [
      'textarea',
      'input',
      'file',
      'image',
      'qrcode',
      'barcode',
      'relationForm',
      'dialogSelect',
      'userSelect',
      'roleSelect',
    ];
  if (column.type === 'int' || column.type === 'decimal') return ['number', 'slider'];
  if (column.type === 'boolean') return ['switch'];
  if (column.type === 'date') return ['date'];
  if (column.type === 'datetime') return ['datetime'];
  return [];
}

export function isFormTypeCompatible(column: DbColumnInfo, type: DevFieldType): boolean {
  return allowedFormTypes(column).includes(type);
}

export function defaultFormType(column: DbColumnInfo): DevFieldType | null {
  if (column.type === 'varchar') return 'input';
  if (column.type === 'text') return 'textarea';
  if (column.type === 'int' || column.type === 'decimal') return 'number';
  if (column.type === 'boolean') return 'switch';
  if (column.type === 'date') return 'date';
  if (column.type === 'datetime') return 'datetime';
  return null;
}
