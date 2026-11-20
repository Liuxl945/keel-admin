/**
 * 字段「落到后端 / 落到列表」的模板注册表。
 *
 * 和 control-templates.ts 成对维护：新增控件时这里要补三件事——
 * 1. `ENTITY_TEMPLATES`：独立建表时的列类型；
 * 2. `FIELD_CELLS`：列表里怎么展示（格式化/缩略图插槽）；
 * 3. `SEARCH_TEMPLATES`：查询条件用哪种控件。
 * 关联已有数据表的模式下列类型来自数据库元数据，这里只管展示与查询。
 */

import type { DevFormFieldInput } from '../dev-form.dto';
import type { DbColumnInfo } from '../../dev-db-table/dev-db-table.introspect';
import { dateFormatOf, js, singleQuote, type ImportSpec } from './shared';

export interface CellContext {
  field: DevFormFieldInput;
  prop: string;
}

export interface CellOutput {
  /** 列对象里的其它片段（width / minWidth / showOverflowTooltip …） */
  props: string[];
  /** 单元格格式化表达式；返回字符串并直接用 value 入参 */
  formatter?: string;
  /** 上传列：交给插槽渲染缩略图/下载链接 */
  slot?: 'image' | 'file';
  /** 需要的 import（由页面按模块合并） */
  imports?: ImportSpec[];
  /** 需要的帮助函数片段 */
  setup?: string[];
}

/** 多选值解码：库里可能是 JSON 字符串、单个字符串或已反序列化的数组 */
export const DECODE_MULTI_SETUP = [
  '/** 多选值解码：兼容 JSON 数组字符串、单值与已反序列化的数组 */',
  'function decodeMulti(value: unknown): string[] {',
  '  if (Array.isArray(value)) return value.map((item) => String(item));',
  "  const text = String(value ?? '').trim();",
  "  if (!text) return [];",
  "  if (text.startsWith('[')) {",
  '    try {',
  '      const parsed = JSON.parse(text) as unknown;',
  '      if (Array.isArray(parsed)) return parsed.map((item) => String(item));',
  '    } catch {',
  '      // 非法 JSON 按单值处理',
  '    }',
  '  }',
  '  return [text];',
  '}',
].join('\n');

export const OPTION_TEXT_SETUP = [
  '/** 选项回显：把存进库里的 value 还原成 label */',
  'function optionTextOf(prop: string, value: unknown): string {',
  "  if (value === null || value === undefined || value === '') return '-';",
  '  const matched = (optionMaps[prop] ?? []).find((item) => String(item.value) === String(value));',
  "  return matched ? matched.label : String(value);",
  '}',
  '',
  'function multiOptionTextOf(prop: string, value: unknown): string {',
  '  const list = decodeMulti(value);',
  "  if (list.length === 0) return '-';",
  "  return list.map((item) => optionTextOf(prop, item)).join('、');",
  '}',
].join('\n');

const HAS_OPTIONS = (field: DevFormFieldInput): boolean =>
  ['select', 'radio', 'checkbox'].includes(field.type) && field.options.length > 0;

const FIELD_CELLS: Record<string, (ctx: CellContext) => CellOutput> = {
  input: () => ({ props: [] }),

  textarea: () => ({ props: ['minWidth: 220', 'showOverflowTooltip: true'] }),

  number: () => ({ props: ['width: 110'] }),

  slider: () => ({ props: ['width: 110'] }),

  select: (ctx) => ({
    props: HAS_OPTIONS(ctx.field) ? [] : ['minWidth: 140'],
    ...(HAS_OPTIONS(ctx.field)
      ? { formatter: `(row, _column, value) => optionTextOf('${ctx.field.name}', value)` }
      : {}),
  }),

  radio: (ctx) => FIELD_CELLS.select(ctx),

  checkbox: (ctx) => ({
    props: ['minWidth: 160'],
    ...(HAS_OPTIONS(ctx.field)
      ? { formatter: `(row, _column, value) => multiOptionTextOf('${ctx.field.name}', value)` }
      : { formatter: '(row, _column, value) => (decodeMulti(value).join(\'、\') || \'-\')' }),
  }),

  switch: () => ({
    props: ['width: 90'],
    formatter: "(row, _column, value) => (value ? '是' : '否')",
  }),

  date: (ctx) => ({
    props: ['width: 120'],
    formatter: `(row, _column, value) => formatByPattern(value, '${dateFormatOf(ctx.field)}')`,
    imports: [{ from: '@/utils/datetime', names: ['formatByPattern'] }],
  }),

  datetime: () => ({
    props: ['width: 120'],
    formatter: "(row, _column, value) => formatByPattern(value, 'HH:mm:ss')",
    imports: [{ from: '@/utils/datetime', names: ['formatByPattern'] }],
  }),

  color: () => ({ props: ['width: 110'] }),

  image: () => ({
    props: ['minWidth: 150', 'showOverflowTooltip: false'],
    slot: 'image',
    imports: [{ from: '@/components/form-controls/UploadCell.vue', default: 'UploadCell' }],
  }),

  file: () => ({
    props: ['minWidth: 180', 'showOverflowTooltip: false'],
    slot: 'file',
    imports: [{ from: '@/components/form-controls/UploadCell.vue', default: 'UploadCell' }],
  }),

  qrcode: () => ({ props: ['width: 120'] }),

  barcode: () => ({ props: ['minWidth: 160'] }),

  relationForm: (ctx) => ({
    props: ['minWidth: 160'],
    formatter: `(row, _column, value) => formatDataPickerCell(value, '${ctx.field.type}') ?? '-'`,
    imports: [{ from: '@/components/form-controls', names: ['formatDataPickerCell'] }],
  }),

  dialogSelect: (ctx) => FIELD_CELLS.relationForm(ctx),

  // 用户 / 角色选择：同样存 {v,l}，直接复用回显文本格式化
  userSelect: (ctx) => FIELD_CELLS.relationForm(ctx),
  roleSelect: (ctx) => FIELD_CELLS.relationForm(ctx),
};

/** 没有对应表单字段（纯数据库列）时，按列类型兜底 */
const COLUMN_CELLS: Record<string, CellOutput> = {
  boolean: { props: ['width: 90'], formatter: "(row, _column, value) => (value ? '是' : '否')" },
  int: { props: ['width: 110'] },
  decimal: { props: ['width: 110'] },
  date: {
    props: ['width: 120'],
    formatter: '(row, _column, value) => formatDate(value)',
    imports: [{ from: '@/utils/datetime', names: ['formatDate'] }],
  },
  datetime: {
    props: ['width: 170'],
    formatter: "(row, _column, value) => formatByPattern(value, 'YYYY-MM-DD HH:mm')",
    imports: [{ from: '@/utils/datetime', names: ['formatByPattern'] }],
  },
  text: { props: ['minWidth: 220', 'showOverflowTooltip: true'] },
  varchar: { props: ['minWidth: 140'] },
};

export interface SearchContext {
  field: DevFormFieldInput;
  prop: string;
}

export interface SearchOutput {
  /** SearchItem 里的额外片段 */
  props: string[];
}

const FIELD_SEARCHES: Record<string, (ctx: SearchContext) => SearchOutput> = {
  date: () => ({ props: ["type: 'date'"] }),
  datetime: () => ({ props: ["type: 'date'"] }),
  switch: (ctx) => ({
    props: [
      "type: 'select'",
      `options: [{ label: '是', value: 'true' }, { label: '否', value: 'false' }]`,
    ],
  }),
  select: (ctx) =>
    HAS_OPTIONS(ctx.field)
      ? { props: ["type: 'select'", `options: ${ctx.field.name}Options`] }
      : { props: [] },
  radio: (ctx) => FIELD_SEARCHES.select(ctx),
  checkbox: (ctx) =>
    HAS_OPTIONS(ctx.field)
      ? { props: ["type: 'select'", 'multiple: true', `options: ${ctx.field.name}Options`] }
      : { props: [] },
};

const COLUMN_SEARCHES: Record<string, SearchOutput> = {
  boolean: {
    props: ["type: 'select'", "options: [{ label: '是', value: 'true' }, { label: '否', value: 'false' }]"],
  },
  date: { props: ["type: 'date'"] },
  datetime: { props: ["type: 'date'"] },
};

export function cellTemplateFor(field: DevFormFieldInput | null, column: DbColumnInfo | null): CellOutput {
  if (field) {
    const template = FIELD_CELLS[field.type];
    if (template) {
      const output = template({ field, prop: field.name });
      return { ...output, props: output.props ?? [] };
    }
  }
  if (column && COLUMN_CELLS[column.type ?? '']) return COLUMN_CELLS[column.type ?? ''];
  return { props: [] };
}

export function searchTemplateFor(field: DevFormFieldInput | null, column: DbColumnInfo | null): SearchOutput {
  if (field) {
    const template = FIELD_SEARCHES[field.type];
    if (template) return template({ field, prop: field.name });
  }
  if (column && COLUMN_SEARCHES[column.type ?? '']) return COLUMN_SEARCHES[column.type ?? ''];
  return { props: [] };
}

/* ---------------- 独立建表：列类型 / 校验 ---------------- */

export interface EntityColumnOutput {
  /** @Column 里的类型片段，如 `type: 'varchar', length: 255` */
  dbType: string;
  /** 实体属性的 TS 类型 */
  tsType: string;
  /** 是否需要引入 DATE_TIME_COLUMN_TYPE（跨库时间列） */
  needsDateTimeType?: boolean;
}

const ENTITY_TEMPLATES: Record<string, (field: DevFormFieldInput) => EntityColumnOutput> = {
  input: (field) => ({
    dbType: "type: 'varchar', length: 255",
    tsType: field.required ? 'string' : 'string | null',
  }),
  textarea: (field) => ({ dbType: "type: 'text'", tsType: field.required ? 'string' : 'string | null' }),
  number: (field) => ({ dbType: "type: 'int'", tsType: field.required ? 'number' : 'number | null' }),
  slider: () => ({ dbType: "type: 'int'", tsType: 'number' }),
  switch: () => ({ dbType: "type: 'boolean', default: false", tsType: 'boolean' }),
  checkbox: () => ({ dbType: "type: 'simple-json'", tsType: 'string[] | null' }),
  date: () => ({ dbType: 'type: DATE_TIME_COLUMN_TYPE', tsType: 'Date | null', needsDateTimeType: true }),
  datetime: () => ({ dbType: 'type: DATE_TIME_COLUMN_TYPE', tsType: 'Date | null', needsDateTimeType: true }),
  color: (field) => ({
    dbType: "type: 'varchar', length: 30",
    tsType: field.required ? 'string' : 'string | null',
  }),
  // 上传/弹框选择：值是 URL 或 {v,l} JSON，varchar(255) 装不下，统一用 text
  image: () => ({ dbType: "type: 'text'", tsType: 'string | null' }),
  file: () => ({ dbType: "type: 'text'", tsType: 'string | null' }),
  relationForm: () => ({ dbType: "type: 'text'", tsType: 'string | null' }),
  dialogSelect: () => ({ dbType: "type: 'text'", tsType: 'string | null' }),
  userSelect: () => ({ dbType: "type: 'text'", tsType: 'string | null' }),
  roleSelect: () => ({ dbType: "type: 'text'", tsType: 'string | null' }),
  qrcode: (field) => ({
    dbType: "type: 'varchar', length: 255",
    tsType: field.required ? 'string' : 'string | null',
  }),
  barcode: (field) => ({
    dbType: "type: 'varchar', length: 255",
    tsType: field.required ? 'string' : 'string | null',
  }),
};

export function entityTemplateFor(field: DevFormFieldInput): EntityColumnOutput {
  const template = ENTITY_TEMPLATES[field.type];
  if (template) return template(field);
  return {
    dbType: "type: 'varchar', length: 255",
    tsType: field.required ? 'string' : 'string | null',
  };
}

const ZOD_TEMPLATES: Record<string, (field: DevFormFieldInput) => string> = {
  number: (field) =>
    field.required
      ? `z.coerce.number({ invalid_type_error: ${singleQuote(`${field.label}必须是数字`)} }).int(${singleQuote(`${field.label}必须是整数`)})`
      : 'z.union([z.coerce.number().int(), z.null()]).optional()',
  slider: () => 'z.coerce.number().int()',
  switch: (field) =>
    field.required
      ? `z.boolean({ required_error: ${singleQuote(`请选择${field.label}`)} })`
      : 'z.boolean().optional()',
  checkbox: (field) =>
    field.required
      ? `z.array(z.string()).min(1, ${singleQuote(`请选择${field.label}`)})`
      : 'z.array(z.string()).optional()',
  date: (field) =>
    field.required
      ? `z.string().min(1, ${singleQuote(`请选择${field.label}`)})`
      : 'z.string().max(30).optional().nullable()',
  datetime: (field) =>
    field.required
      ? `z.string().min(1, ${singleQuote(`请选择${field.label}`)})`
      : 'z.string().max(30).optional().nullable()',
};

export function zodTemplateFor(field: DevFormFieldInput): string {
  const template = ZOD_TEMPLATES[field.type];
  if (template) return template(field);

  const verb = [
    'select',
    'radio',
    'image',
    'file',
    'qrcode',
    'barcode',
    'color',
    'relationForm',
    'dialogSelect',
    'userSelect',
    'roleSelect',
  ].includes(field.type)
    ? '选择'
    : '输入';
  const message = singleQuote(`请${verb}${field.label}`);
  // 上传/弹框选择可能存多值 JSON，长度上限放开
  const max = [
    'image',
    'file',
    'relationForm',
    'dialogSelect',
    'userSelect',
    'roleSelect',
  ].includes(field.type)
    ? 20000
    : field.type === 'textarea'
      ? 5000
      : field.type === 'select' || field.type === 'radio'
        ? 100
        : 255;

  return field.required
    ? `z.string({ required_error: ${message} }).trim().min(1, ${message}).max(${max}, ${singleQuote(`${field.label}不能超过 ${max}`)})`
    : `z.string().trim().max(${max}).optional().nullable()`;
}

/** 前端接口类型：Item 用可空写法，Payload 去掉 null */
export function apiTypeFor(field: DevFormFieldInput, target: 'item' | 'payload'): string {
  if (field.type === 'number') return target === 'item' ? (field.required ? 'number' : 'number | null') : 'number';
  if (field.type === 'slider') return 'number';
  if (field.type === 'switch') return 'boolean';
  if (field.type === 'checkbox') return target === 'item' ? 'string[] | null' : 'string[]';
  if (['date', 'datetime'].includes(field.type)) return target === 'item' ? 'string | null' : 'string';
  return target === 'item' ? 'string | null' : 'string';
}

/** 选项常量在列表列里也可能被引用，这里统一取名字 */
export function optionConstName(field: DevFormFieldInput): string {
  return `${field.name}Options`;
}

export { js };
