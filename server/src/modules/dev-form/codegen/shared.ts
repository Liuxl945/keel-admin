/**
 * 代码生成的公共工具：命名转换、字面量转义、缩进。
 *
 * 这里只放与「控件类型」无关的纯函数，控件差异全部在 control-templates.ts /
 * column-templates.ts 里表达。
 */

import type { DevFormSchemaInput } from '../dev-form.dto';

export interface GeneratedFile {
  name: string;
  language: 'ts' | 'vue' | 'markdown' | 'sql';
  content: string;
}

export type QueryColumnConfig = DevFormSchemaInput['list']['queryColumns'][number];
export type ListColumnConfig = DevFormSchemaInput['list']['listColumns'][number];

export function toPascal(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toCamel(value: string): string {
  const pascal = toPascal(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** 字符串字面量，统一用 JSON.stringify 避免引号/换行破坏生成代码 */
export function js(value: string): string {
  return JSON.stringify(value);
}

/** 单引号字符串字面量（用于压缩成单行的注释/提示语） */
export function singleQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;
}

/** 写进注释的文本，不能带换行和单引号 */
export function comment(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

/** Vue 模板属性/文本需要 HTML 转义，不能直接塞 JSON 字符串 */
export function html(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 去重且去掉空串，保持首次出现的顺序（import / setup 片段合并用） */
export function unique(list: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (!item) continue;
    const text = item;
    if (seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

/** import 规格：多个模板各自声明要用的符号，最后按模块合并成一条语句 */
export interface ImportSpec {
  from: string;
  /** 默认导入的符号名，如 UploadCell */
  default?: string;
  /** 具名导入，可以带 `type ` 前缀 */
  names?: string[];
}

/** 合并 import：同一模块只留一条，符号去重并按首次出现排序 */
export function mergeImports(specs: ImportSpec[]): string[] {
  const order: string[] = [];
  const byModule = new Map<string, { default?: string; names: string[] }>();

  for (const spec of specs) {
    let entry = byModule.get(spec.from);
    if (!entry) {
      entry = { names: [] };
      byModule.set(spec.from, entry);
      order.push(spec.from);
    }
    if (spec.default && !entry.default) entry.default = spec.default;
    for (const name of spec.names ?? []) {
      if (!entry.names.includes(name)) entry.names.push(name);
    }
  }

  return order.map((from) => {
    const entry = byModule.get(from)!;
    const parts: string[] = [];
    if (entry.default) parts.push(entry.default);
    if (entry.names.length > 0) parts.push(`{ ${entry.names.join(', ')} }`);
    return `import ${parts.join(', ')} from '${from}';`;
  });
}

/** 把多行文本整体缩进，空行保持为空 */
export function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

/** 控件/表单项统一缩进层级（el-form-item 内部） */
export const CONTROL_INDENT = 14;

/** 日期控件格式：与 admin/src/components/form-controls/date-format.ts 保持同一套规则 */
export function dateFormatOf(field: { type?: string | null; dateFormat?: string | null }): string {
  const isTime = (format?: string | null): boolean => format === 'HH:mm:ss' || format === 'HH:mm';
  if (field.type === 'datetime') return isTime(field.dateFormat) ? field.dateFormat! : 'HH:mm:ss';
  return field.dateFormat || 'YYYY-MM-DD';
}

/** 按 dayjs token 推导 el-date-picker 的 type（仅 date 控件使用） */
export function datePickerTypeOf(format: string): 'year' | 'month' | 'date' | 'datetime' {
  if (/[Hms]/.test(format)) return 'datetime';
  if (/D{1,2}/.test(format)) return 'date';
  if (/M{1,2}/.test(format)) return 'month';
  return 'year';
}
