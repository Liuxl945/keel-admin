/**
 * 独立表单模式的后端代码：实体 / 校验 / 服务 / 控制器 / 路由。
 * 列类型与校验表达式来自 column-templates.ts。
 */

import type { DevForm } from '../../../db/entities';
import type { DevFormFieldInput, DevFormSchemaInput } from '../dev-form.dto';
import { entityTemplateFor, zodTemplateFor } from './column-templates';
import { comment, singleQuote, toCamel, toPascal, toSnake } from './shared';

function columnLine(field: DevFormFieldInput): string {
  const template = entityTemplateFor(field);
  const prop = toSnake(field.name);
  const parts = [`name: '${prop}'`, template.dbType];
  if (template.tsType.includes('null')) parts.push('nullable: true');
  parts.push(`comment: '${comment(field.label)}'`);
  return [`  @Column({ ${parts.join(', ')} })`, `  ${prop}!: ${template.tsType};`].join('\n');
}

export function generateFormEntity(form: DevForm, schema: DevFormSchemaInput): string {
  const className = toPascal(form.form_key);
  const needsDateTime = schema.fields.some((field) => entityTemplateFor(field).needsDateTimeType);
  const imports = [
    "import { Column, Entity, Index } from 'typeorm';",
    "import { BaseEntity } from '../../db/entities/base.entity';",
  ];
  if (needsDateTime) imports.push("import { DATE_TIME_COLUMN_TYPE } from '../../db/column-types';");

  return [
    ...imports,
    '',
    `@Entity('biz_${form.form_key}')`,
    `@Index('IDX_${form.form_key}_created', ['createdAt'])`,
    `export class ${className} extends BaseEntity {`,
    ...schema.fields.map(columnLine),
    '}',
    '',
  ].join('\n');
}

export function generateFormDto(form: DevForm, schema: DevFormSchemaInput): string {
  const className = toPascal(form.form_key);
  const camel = toCamel(form.form_key);
  return [
    "import { z } from 'zod';",
    "import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';",
    '',
    'const baseSchema = z.object({',
    ...schema.fields.map((field) => `  ${field.name}: ${zodTemplateFor(field)},`),
    '});',
    '',
    `export const create${className}Schema = baseSchema;`,
    `export const update${className}Schema = baseSchema.partial();`,
    '',
    `export const ${camel}QuerySchema = z.object({`,
    '  page: pageQuerySchema,',
    '  pageSize: pageSizeQuerySchema,',
    '  keyword: z.string().trim().max(100).optional(),',
    '});',
    '',
    `export type Create${className}Input = z.infer<typeof create${className}Schema>;`,
    `export type Update${className}Input = z.infer<typeof update${className}Schema>;`,
    `export type ${className}Query = z.infer<typeof ${camel}QuerySchema>;`,
    '',
  ].join('\n');
}

/** DTO 值 → 实体列值 */
function toEntityExpression(field: DevFormFieldInput, varName: string): string {
  const value = `${varName}.${field.name}`;
  if (field.type === 'switch') return `${value} ?? false`;
  if (field.type === 'number' || field.type === 'slider') return `${value} ?? null`;
  if (field.type === 'checkbox') return `${value} ?? []`;
  if (field.type === 'date' || field.type === 'datetime') {
    return field.required ? `new Date(${value})` : `${value} ? new Date(${value}) : null`;
  }
  return `${value} ?? null`;
}

export function generateFormService(form: DevForm, schema: DevFormSchemaInput): string {
  const className = toPascal(form.form_key);
  const searchField = schema.fields.find((field) =>
    ['input', 'textarea', 'select', 'radio'].includes(field.type),
  );
  const searchProp = searchField ? toSnake(searchField.name) : null;

  return [
    "import { AppDataSource } from '../../db/data-source';",
    `import { ${className} } from './${form.form_key}.entity';`,
    "import { AppError, ERROR_CODES } from '../../utils/app-error';",
    "import { parsePagination } from '../../utils/pagination';",
    `import type { Create${className}Input, ${className}Query, Update${className}Input } from './${form.form_key}.dto';`,
    '',
    'function repo() {',
    `  return AppDataSource.getRepository(${className});`,
    '}',
    '',
    `function toDto(row: ${className}) {`,
    '  return {',
    '    id: row.id,',
    ...schema.fields.map((field) => `    ${field.name}: row.${toSnake(field.name)},`),
    '    createdAt: row.createdAt,',
    '    updatedAt: row.updatedAt,',
    '  };',
    '}',
    '',
    `function toEntity(input: Create${className}Input) {`,
    '  return {',
    ...schema.fields.map((field) => `    ${toSnake(field.name)}: ${toEntityExpression(field, 'input')},`),
    '  };',
    '}',
    '',
    `export async function list${className}(query: ${className}Query) {`,
    '  const { page, pageSize } = parsePagination(query as Record<string, unknown>);',
    '  const qb = repo()',
    "    .createQueryBuilder('row')",
    "    .orderBy('row.createdAt', 'DESC')",
    '    .skip((page - 1) * pageSize)',
    '    .take(pageSize);',
    ...(searchProp
      ? [
          '  if (query.keyword) {',
          `    qb.andWhere('row.${searchProp} LIKE :keyword', { keyword: \`%\${query.keyword}%\` });`,
          '  }',
        ]
      : []),
    '  const [rows, total] = await qb.getManyAndCount();',
    '  return { list: rows.map(toDto), total, page, pageSize };',
    '}',
    '',
    `export async function get${className}(id: number) {`,
    '  const row = await repo().findOneBy({ id });',
    "  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');",
    '  return toDto(row);',
    '}',
    '',
    `export async function create${className}(input: Create${className}Input) {`,
    '  const row = repo().create(toEntity(input));',
    '  await repo().save(row);',
    '  return toDto(row);',
    '}',
    '',
    `export async function update${className}(id: number, input: Update${className}Input) {`,
    `  await get${className}(id);`,
    `  const patch: Partial<${className}> = {`,
    ...schema.fields.map(
      (field) =>
        `    ...(input.${field.name} !== undefined ? { ${toSnake(field.name)}: ${toEntityExpression(field, 'input')} } : {}),`,
    ),
    '  };',
    '  if (Object.keys(patch).length > 0) await repo().update(id, patch);',
    `  return get${className}(id);`,
    '}',
    '',
    `export async function delete${className}(id: number) {`,
    `  await get${className}(id);`,
    '  await repo().delete({ id });',
    '}',
    '',
  ].join('\n');
}

export function generateFormController(form: DevForm): string {
  const className = toPascal(form.form_key);
  return [
    "import type { Request } from 'express';",
    "import { ok } from '../../utils/response';",
    `import type { Create${className}Input, ${className}Query, Update${className}Input } from './${form.form_key}.dto';`,
    `import { create${className}, delete${className}, get${className}, list${className}, update${className} } from './${form.form_key}.service';`,
    '',
    `export async function list${className}Controller(req: Request) {`,
    `  return ok(await list${className}(req.query as unknown as ${className}Query));`,
    '}',
    '',
    `export async function get${className}Controller(req: Request) {`,
    `  return ok(await get${className}(Number(req.params.id)));`,
    '}',
    '',
    `export async function create${className}Controller(req: Request) {`,
    `  return ok(await create${className}(req.body as Create${className}Input));`,
    '}',
    '',
    `export async function update${className}Controller(req: Request) {`,
    `  return ok(await update${className}(Number(req.params.id), req.body as Update${className}Input));`,
    '}',
    '',
    `export async function delete${className}Controller(req: Request) {`,
    `  await delete${className}(Number(req.params.id));`,
    "  return ok(null, '删除成功');",
    '}',
    '',
  ].join('\n');
}

export function generateFormRoute(form: DevForm): string {
  const className = toPascal(form.form_key);
  const camel = toCamel(form.form_key);
  const permPrefix = `biz_${form.form_key}`;
  return [
    "import { Router } from 'express';",
    "import { hasPerm } from '../../middlewares/auth';",
    "import { validateBody, validateQuery } from '../../middlewares/validate';",
    "import { asyncHandler } from '../../utils/async-handler';",
    `import { create${className}Controller, delete${className}Controller, get${className}Controller, list${className}Controller, update${className}Controller } from './${form.form_key}.controller';`,
    `import { create${className}Schema, ${camel}QuerySchema, update${className}Schema } from './${form.form_key}.dto';`,
    '',
    `export const ${camel}Router = Router();`,
    '',
    '// 列表',
    `${camel}Router.get(`,
    "  '/',",
    `  hasPerm('${permPrefix}:list'),`,
    `  validateQuery(${camel}QuerySchema),`,
    '  asyncHandler(async (req, res) => {',
    `    res.json(await list${className}Controller(req));`,
    '  }),',
    ');',
    '',
    '// 新增',
    `${camel}Router.post(`,
    "  '/',",
    `  hasPerm('${permPrefix}:create'),`,
    `  validateBody(create${className}Schema),`,
    '  asyncHandler(async (req, res) => {',
    `    res.json(await create${className}Controller(req));`,
    '  }),',
    ');',
    '',
    '// 详情',
    `${camel}Router.get(`,
    "  '/:id',",
    `  hasPerm('${permPrefix}:list'),`,
    '  asyncHandler(async (req, res) => {',
    `    res.json(await get${className}Controller(req));`,
    '  }),',
    ');',
    '',
    '// 修改',
    `${camel}Router.put(`,
    "  '/:id',",
    `  hasPerm('${permPrefix}:update'),`,
    `  validateBody(update${className}Schema),`,
    '  asyncHandler(async (req, res) => {',
    `    res.json(await update${className}Controller(req));`,
    '  }),',
    ');',
    '',
    '// 删除',
    `${camel}Router.delete(`,
    "  '/:id',",
    `  hasPerm('${permPrefix}:delete'),`,
    '  asyncHandler(async (req, res) => {',
    `    res.json(await delete${className}Controller(req));`,
    '  }),',
    ');',
    '',
  ].join('\n');
}

export { singleQuote };
