/**
 * 独立表单模式的前端接口文件：类型由字段模板推导，
 * 保证「控件值类型 = 接口类型」，不会出现多选框绑到 string 的情况。
 */

import type { DevForm } from '../../../db/entities';
import type { DevFormFieldInput, DevFormSchemaInput } from '../dev-form.dto';
import { toPascal } from './shared';

/** 列表项：读接口，允许 null */
function itemType(field: DevFormFieldInput): string {
  if (field.type === 'number') return 'number | null';
  if (field.type === 'slider') return 'number';
  if (field.type === 'switch') return 'boolean';
  if (field.type === 'checkbox') return 'string[] | null';
  return 'string | null';
}

/** 提交体：与表单模型的类型保持一致 */
function payloadType(field: DevFormFieldInput): string {
  if (field.type === 'number') return 'number | null';
  if (field.type === 'slider') return 'number';
  if (field.type === 'switch') return 'boolean';
  if (field.type === 'checkbox') return 'string[]';
  return 'string';
}

export function generateFormApi(form: DevForm, schema: DevFormSchemaInput): string {
  const className = toPascal(form.form_key);
  const key = form.form_key;
  return [
    "import type { PageResult } from '@/types/api';",
    "import { http } from '@/api/request';",
    '',
    `export interface ${className}Item {`,
    '  id: number;',
    ...schema.fields.map((field) => `  ${field.name}: ${itemType(field)};`),
    '  createdAt: string;',
    '  updatedAt: string;',
    '}',
    '',
    `export interface ${className}Payload {`,
    ...schema.fields.map(
      (field) => `  ${field.name}${field.required ? '' : '?'}: ${payloadType(field)};`,
    ),
    '}',
    '',
    `export interface ${className}Query {`,
    '  page?: number;',
    '  pageSize?: number;',
    '  keyword?: string;',
    '  [key: string]: unknown;',
    '}',
    '',
    `export function list${className}(params: ${className}Query): Promise<PageResult<${className}Item>> {`,
    `  return http.get<PageResult<${className}Item>>('/admin/${key}', { params });`,
    '}',
    '',
    `export function get${className}(id: number): Promise<${className}Item> {`,
    `  return http.get<${className}Item>(\`/admin/${key}/\${id}\`);`,
    '}',
    '',
    `export function create${className}(payload: ${className}Payload): Promise<${className}Item> {`,
    `  return http.post<${className}Item>('/admin/${key}', payload);`,
    '}',
    '',
    `export function update${className}(id: number, payload: Partial<${className}Payload>): Promise<${className}Item> {`,
    `  return http.put<${className}Item>(\`/admin/${key}/\${id}\`, payload);`,
    '}',
    '',
    `export function delete${className}(id: number): Promise<null> {`,
    `  return http.delete<null>(\`/admin/${key}/\${id}\`);`,
    '}',
    '',
  ].join('\n');
}
