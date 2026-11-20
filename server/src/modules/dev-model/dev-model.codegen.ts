import type { DevDataSource, DevModel } from '../../db/entities';
import { buildCreateTableStatements, formatSql } from './dev-model.ddl';
import type { DevModelFieldInput } from './dev-model.dto';

export interface GeneratedFile {
  name: string;
  language: 'ts' | 'vue' | 'sql' | 'markdown';
  content: string;
}

/** 数据建模与表单设计共用同一套表结构代码生成 */
export interface TableCodegenModel {
  name: string;
  model_key: string;
  table_name: string;
  table_comment: string | null;
}

/**
 * 明细（从表）代码生成上下文。表单关联了从表时传入，数据建模本身不传。
 * - entityName：从表实体类名（由主表 key + 从表名拼出，保证全局唯一）
 * - className：主表实体类名
 * - foreignKey：从表上指向主表的外键列
 * - masterColumn：主表被引用列（通常是 id）
 * - fields：从表业务列的建模字段（含外键列，不含系统列）
 * - detailFields：明细表里实际展示/可编辑的字段（通常等于 fields 去掉外键）
 */
export interface DetailCodegenMeta {
  tableName: string;
  entityName: string;
  entityFile: string;
  label: string;
  foreignKey: string;
  masterColumn: string;
  /** 从表全部业务列（含外键），用于生成从表 entity */
  entityFields: DevModelFieldInput[];
  /** 明细录入/展示字段（去掉外键与系统列） */
  fields: DevModelFieldInput[];
  /** 需要在主表列表里聚合展示的明细列（source=subtable 的列表列） */
  listColumns: Array<{ columnName: string; fieldName: string; label: string; type: string }>;
}

export type DetailsCodegenInput = DetailCodegenMeta[];

function toPascal(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toCamel(value: string): string {
  const pascal = toPascal(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function js(value: string): string {
  return JSON.stringify(value);
}

function singleQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;
}

function comment(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

function html(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function entityType(field: DevModelFieldInput): string {
  const nullable = field.nullable;
  if (field.type === 'varchar' || field.type === 'text' || field.type === 'date') {
    return nullable ? 'string | null' : 'string';
  }
  if (field.type === 'int' || field.type === 'decimal') {
    return nullable ? 'number | null' : 'number';
  }
  if (field.type === 'datetime') {
    return nullable ? 'Date | null' : 'Date';
  }
  return 'boolean';
}

function itemType(field: DevModelFieldInput): string {
  if (field.type === 'varchar' || field.type === 'text' || field.type === 'date' || field.type === 'datetime') {
    return field.nullable ? 'string | null' : 'string';
  }
  if (field.type === 'int' || field.type === 'decimal') {
    return field.nullable ? 'number | null' : 'number';
  }
  return 'boolean';
}

function payloadType(field: DevModelFieldInput): string {
  if (field.type === 'int' || field.type === 'decimal') return 'number';
  if (field.type === 'boolean') return 'boolean';
  return 'string';
}

function entityColumn(field: DevModelFieldInput): string {
  const nullable = field.nullable ? 'nullable: true, ' : '';
  const unique = field.unique ? 'unique: true, ' : '';
  let typeLine = '';

  if (field.type === 'varchar') typeLine = `type: 'varchar', length: ${field.length}`;
  else if (field.type === 'text') typeLine = `type: 'text'`;
  else if (field.type === 'int') typeLine = `type: 'int'`;
  else if (field.type === 'decimal') {
    typeLine = `type: 'decimal', precision: ${field.precision}, scale: ${field.scale}, transformer: decimalTransformer`;
  } else if (field.type === 'boolean') typeLine = `type: 'boolean', default: false`;
  else if (field.type === 'date') typeLine = `type: 'date'`;
  else typeLine = `type: DATE_TIME_COLUMN_TYPE`;

  return [
    `  @Column({ name: '${field.columnName}', ${typeLine}, ${nullable}${unique}comment: '${comment(field.label)}' })`,
    `  ${field.columnName}!: ${entityType(field)};`,
  ].join('\n');
}

function zodField(field: DevModelFieldInput): string {
  const label = field.label;
  const requiredMessage = `请${['date', 'datetime'].includes(field.type) ? '选择' : '输入'}${label}`;

  if (field.type === 'int') {
    return field.nullable
      ? 'z.union([z.coerce.number().int(), z.null()]).optional()'
      : `z.coerce.number({ invalid_type_error: ${singleQuote(`${label}必须是数字`)} }).int(${singleQuote(`${label}必须是整数`)})`;
  }
  if (field.type === 'decimal') {
    return field.nullable
      ? 'z.union([z.coerce.number(), z.null()]).optional()'
      : `z.coerce.number({ invalid_type_error: ${singleQuote(`${label}必须是数字`)} })`;
  }
  if (field.type === 'boolean') {
    return field.nullable ? 'z.boolean().optional()' : `z.boolean({ required_error: ${singleQuote(requiredMessage)} })`;
  }
  if (field.type === 'date' || field.type === 'datetime') {
    return field.nullable
      ? 'z.string().max(40).optional().nullable()'
      : `z.string({ required_error: ${singleQuote(requiredMessage)} }).min(1, ${singleQuote(requiredMessage)})`;
  }

  const max = field.type === 'text' ? 20000 : field.length;
  return field.nullable
    ? `z.string().trim().max(${max}).optional().nullable()`
    : `z.string({ required_error: ${singleQuote(requiredMessage)} }).trim().min(1, ${singleQuote(requiredMessage)}).max(${max}, ${singleQuote(`${label}不能超过 ${max}`)})`;
}

function toEntityExpression(field: DevModelFieldInput, varName: string): string {
  const value = `${varName}.${field.fieldName}`;
  if (field.type === 'boolean') return `${value} ?? false`;
  if (field.type === 'datetime') {
    return field.nullable ? `${value} ? new Date(${value}) : null` : `new Date(${value})`;
  }
  if (field.type === 'int' || field.type === 'decimal') {
    return field.nullable ? `${value} ?? null` : value;
  }
  return field.nullable ? `${value} ?? null` : value;
}

function fieldControl(field: DevModelFieldInput): string {
  const model = `form.${field.fieldName}`;
  if (field.type === 'varchar') {
    return `<el-input v-model="${model}" placeholder="${html(`请输入${field.label}`)}" clearable />`;
  }
  if (field.type === 'text') {
    return `<el-input v-model="${model}" type="textarea" :rows="4" placeholder="${html(`请输入${field.label}`)}" />`;
  }
  if (field.type === 'int') {
    return `<el-input-number v-model="${model}" style="width: 100%" />`;
  }
  if (field.type === 'decimal') {
    const step = 1 / 10 ** field.scale;
    return `<el-input-number v-model="${model}" :precision="${field.scale}" :step="${step}" style="width: 100%" />`;
  }
  if (field.type === 'boolean') {
    return `<el-switch v-model="${model}" />`;
  }
  if (field.type === 'date') {
    return `<el-date-picker v-model="${model}" type="date" value-format="YYYY-MM-DD" placeholder="请选择${html(field.label)}" style="width: 100%" />`;
  }
  return `<el-date-picker v-model="${model}" type="datetime" value-format="YYYY-MM-DDTHH:mm" placeholder="请选择${html(field.label)}" style="width: 100%" />`;
}

function fieldRule(field: DevModelFieldInput): string {
  if (field.nullable || field.type === 'boolean') return '';
  const trigger = ['date', 'datetime'].includes(field.type) ? 'change' : 'blur';
  const message = `请${['date', 'datetime'].includes(field.type) ? '选择' : '输入'}${field.label}`;
  return `  ${field.fieldName}: [{ required: true, message: ${singleQuote(message)}, trigger: '${trigger}' }],`;
}

function initialValue(field: DevModelFieldInput): string {
  if (field.type === 'boolean') return 'false';
  if (field.type === 'int' || field.type === 'decimal') return field.nullable ? 'undefined' : '0';
  return "''";
}

function editAssign(field: DevModelFieldInput): string {
  if (field.type === 'datetime') {
    return `  form.${field.fieldName} = row.${field.fieldName} ? toLocalDateTimeInput(row.${field.fieldName}) : '';`;
  }
  if (field.type === 'date') {
    return `  form.${field.fieldName} = row.${field.fieldName} ?? '';`;
  }
  if (field.type === 'boolean') {
    return `  form.${field.fieldName} = Boolean(row.${field.fieldName});`;
  }
  if (field.type === 'int' || field.type === 'decimal') {
    return `  form.${field.fieldName} = row.${field.fieldName} ?? undefined;`;
  }
  return `  form.${field.fieldName} = row.${field.fieldName} ?? '';`;
}

function columnWidth(field: DevModelFieldInput): number {
  if (field.type === 'boolean') return 90;
  if (field.type === 'int' || field.type === 'decimal') return 110;
  if (field.type === 'date') return 120;
  if (field.type === 'datetime') return 170;
  if (field.type === 'text') return 220;
  return 150;
}

function listColumn(field: DevModelFieldInput): string {
  const base = `  { prop: '${field.fieldName}', label: ${js(field.label)}, width: ${columnWidth(field)}`;
  if (field.type === 'datetime') {
    return `${base}, formatter: (row: any) => formatDateTime(row.${field.fieldName}) },`;
  }
  if (field.type === 'date') {
    return `${base}, formatter: (row: any) => formatDate(row.${field.fieldName}) },`;
  }
  if (field.type === 'boolean') {
    return `${base}, formatter: (row: any) => (row.${field.fieldName} ? '是' : '否') },`;
  }
  if (field.type === 'text') {
    return `  { prop: '${field.fieldName}', label: ${js(field.label)}, minWidth: 220, showOverflowTooltip: true },`;
  }
  return `${base} },`;
}

export function generateEntity(model: TableCodegenModel, fields: DevModelFieldInput[]): string {
  const className = toPascal(model.model_key);
  const hasDecimal = fields.some((field) => field.type === 'decimal');
  const hasDatetime = fields.some((field) => field.type === 'datetime');
  const imports = [
    "import { Column, Entity } from 'typeorm';",
    "import { BaseEntity } from '../../db/entities/base.entity';",
  ];
  if (hasDatetime) imports.push("import { DATE_TIME_COLUMN_TYPE } from '../../db/column-types';");

  const lines = [...imports, ''];
  if (hasDecimal) {
    lines.push(
      'const decimalTransformer = {',
      '  to: (value: number | null) => value,',
      '  from: (value: string | null) => (value === null ? null : Number(value)),',
      '};',
      '',
    );
  }
  lines.push(`@Entity('${model.table_name}')`, `export class ${className} extends BaseEntity {`);
  fields.forEach((field) => lines.push(entityColumn(field)));
  lines.push('}', '');
  return lines.join('\n');
}

function zodQueryField(field: DevModelFieldInput): string {
  if (field.type === 'int' || field.type === 'decimal') {
    return 'z.coerce.number().optional()';
  }
  if (field.type === 'boolean') {
    return "z.enum(['true', 'false']).optional()";
  }
  if (field.type === 'date' || field.type === 'datetime') {
    return 'z.string().max(40).optional()';
  }
  return 'z.string().trim().max(200).optional()';
}

function generateDto(
  model: TableCodegenModel,
  fields: DevModelFieldInput[],
  queryFields: DevModelFieldInput[] = [],
  details: DetailsCodegenInput = [],
): string {
  const className = toPascal(model.model_key);
  const camel = toCamel(model.model_key);
  const hasDetails = details.length > 0;
  const detailRowsSchema = hasDetails
    ? [
        '/** 明细行：主键可选（新增不带、编辑带），业务字段沿用宽松的字符串/数字/布尔 */',
        ...details.map((d) => {
          const fieldLines = d.fields.map((field) => {
            let schema: string;
            if (field.type === 'int' || field.type === 'decimal') {
              schema = 'z.union([z.coerce.number(), z.null()]).optional()';
            } else if (field.type === 'boolean') {
              schema = 'z.boolean().optional()';
            } else {
              schema = 'z.string().nullable().optional()';
            }
            return `    ${field.fieldName}: ${schema},`;
          });
          return [
            `  ${d.tableName}: z.array(z.object({`,
            '    id: z.number().int().positive().optional(),',
            ...fieldLines,
            '  })).optional(),',
          ].join('\n');
        }),
      ].join('\n')
    : '';

  return [
    "import { z } from 'zod';",
    "import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';",
    '',
    'const baseSchema = z.object({',
    ...fields.map((field) => `  ${field.fieldName}: ${zodField(field)},`),
    '});',
    '',
    ...(hasDetails
      ? [
          'const detailsSchema = z.object({',
          detailRowsSchema,
          '}).optional();',
          '',
          `export const create${className}Schema = baseSchema.extend({ details: detailsSchema });`,
          `export const update${className}Schema = baseSchema.partial().extend({ details: detailsSchema });`,
        ]
      : [
          `export const create${className}Schema = baseSchema;`,
          `export const update${className}Schema = baseSchema.partial();`,
        ]),
    '',
    `export const ${camel}QuerySchema = z.object({`,
    '  page: pageQuerySchema,',
    '  pageSize: pageSizeQuerySchema,',
    '  keyword: z.string().trim().max(100).optional(),',
    ...queryFields.map((field) => `  ${field.fieldName}: ${zodQueryField(field)},`),
    '});',
    '',
    `export type Create${className}Input = z.infer<typeof create${className}Schema>;`,
    `export type Update${className}Input = z.infer<typeof update${className}Schema>;`,
    `export type ${className}Query = z.infer<typeof ${camel}QuerySchema>;`,
    '',
  ].join('\n');
}

function generateService(
  model: TableCodegenModel,
  fields: DevModelFieldInput[],
  queryFields: DevModelFieldInput[] = [],
): string {
  const className = toPascal(model.model_key);
  const searchField =
    fields.find((field) => field.searchable && ['varchar', 'text'].includes(field.type)) ??
    fields.find((field) => ['varchar', 'text'].includes(field.type));

  const queryConditions = queryFields.flatMap((field) => {
    const prop = field.columnName;
    const name = field.fieldName;
    if (field.type === 'int' || field.type === 'decimal') {
      return [
        `  if (query.${name} !== undefined) {`,
        `    qb.andWhere('row.${prop} = :${name}', { ${name}: query.${name} });`,
        '  }',
      ];
    }
    if (field.type === 'boolean') {
      return [
        `  if (query.${name}) {`,
        `    qb.andWhere('row.${prop} = :${name}', { ${name}: query.${name} === 'true' });`,
        '  }',
      ];
    }
    if (field.type === 'date' || field.type === 'datetime') {
      return [
        `  if (query.${name}) {`,
        `    const ${name}Start = new Date(\`\${query.${name}}T00:00:00\`);`,
        `    const ${name}End = new Date(${name}Start);`,
        `    ${name}End.setDate(${name}End.getDate() + 1);`,
        `    qb.andWhere('row.${prop} >= :${name}Start AND row.${prop} < :${name}End', {`,
        `      ${name}Start,`,
        `      ${name}End,`,
        '    });',
        '  }',
      ];
    }
    return [
      `  if (query.${name}) {`,
      `    qb.andWhere('row.${prop} LIKE :${name}', { ${name}: \`%\${query.${name}}%\` });`,
      '  }',
    ];
  });

  return [
    "import { AppDataSource } from '../../db/data-source';",
    `import { ${className} } from './${model.model_key}.entity';`,
    "import { AppError, ERROR_CODES } from '../../utils/app-error';",
    "import { parsePagination } from '../../utils/pagination';",
    `import type { Create${className}Input, ${className}Query, Update${className}Input } from './${model.model_key}.dto';`,
    '',
    'function repo() {',
    `  return AppDataSource.getRepository(${className});`,
    '}',
    '',
    `function toDto(row: ${className}) {`,
    '  return {',
    '    id: row.id,',
    ...fields.map((field) => `    ${field.fieldName}: row.${field.columnName},`),
    '    createdAt: row.createdAt,',
    '    updatedAt: row.updatedAt,',
    '  };',
    '}',
    '',
    `function toEntity(input: Create${className}Input) {`,
    '  return {',
    ...fields.map((field) => `    ${field.columnName}: ${toEntityExpression(field, 'input')},`),
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
    ...(searchField
      ? [
          '  if (query.keyword) {',
          `    qb.andWhere('row.${searchField.columnName} LIKE :keyword', { keyword: \`%\${query.keyword}%\` });`,
          '  }',
        ]
      : []),
    ...queryConditions,
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
    ...fields.map(
      (field) =>
        `    ...(input.${field.fieldName} !== undefined ? { ${field.columnName}: ${toEntityExpression(field, 'input')} } : {}),`,
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

/**
 * 明细值转换：前端字段（camelCase）→ 从表物理列（snake_case）。
 * 数字/布尔/日期按列类型转换，空字符串按可空性归 null。
 */
function detailEntityLines(fields: DevModelFieldInput[], indent = '      '): string[] {
  return fields.map((field) => {
    const value = `row.${field.fieldName}`;
    let expr: string;
    if (field.type === 'int' || field.type === 'decimal') {
      expr = field.nullable ? `numberOrNull(${value})` : `numberOrNull(${value}) ?? 0`;
    } else if (field.type === 'boolean') {
      expr = `Boolean(${value})`;
    } else if (field.type === 'datetime') {
      expr = field.nullable ? `dateOrNull(${value})` : `dateOrNull(${value}) ?? new Date()`;
    } else if (field.type === 'date') {
      expr = field.nullable ? `${value} || null` : `${value} ?? ''`;
    } else {
      expr = field.nullable ? `${value} ?? null` : `${value} ?? ''`;
    }
    return `${indent}${field.columnName}: ${expr},`;
  });
}

/** 从表行 → DTO（camelCase 字段），日期转字符串 */
function detailDtoLines(fields: DevModelFieldInput[], indent = '    '): string[] {
  return fields.map((field) => {
    const raw = `item.${field.columnName}`;
    if (field.type === 'datetime' || field.type === 'date') {
      return `${indent}${field.fieldName}: toDateString(${raw}),`;
    }
    return `${indent}${field.fieldName}: ${raw},`;
  });
}

/**
 * 带明细（子表）的 service：主表 CRUD + 同事务的明细 upsert / 回显 / 级联删除。
 * 数据建模不调用；表单关联了从表时由 form codegen 调用。
 */
export function generateServiceWithDetails(
  model: TableCodegenModel,
  fields: DevModelFieldInput[],
  details: DetailsCodegenInput,
  queryFields: DevModelFieldInput[] = [],
): string {
  const className = toPascal(model.model_key);
  const searchField =
    fields.find((field) => field.searchable && ['varchar', 'text'].includes(field.type)) ??
    fields.find((field) => ['varchar', 'text'].includes(field.type));

  const queryConditions = queryFields.flatMap((field) => {
    const prop = field.columnName;
    const name = field.fieldName;
    if (field.type === 'int' || field.type === 'decimal') {
      return [
        `  if (query.${name} !== undefined) {`,
        `    qb.andWhere('row.${prop} = :${name}', { ${name}: query.${name} });`,
        '  }',
      ];
    }
    if (field.type === 'boolean') {
      return [
        `  if (query.${name}) {`,
        `    qb.andWhere('row.${prop} = :${name}', { ${name}: query.${name} === 'true' });`,
        '  }',
      ];
    }
    if (field.type === 'date' || field.type === 'datetime') {
      return [
        `  if (query.${name}) {`,
        `    const ${name}Start = new Date(\`\${query.${name}}T00:00:00\`);`,
        `    const ${name}End = new Date(${name}Start);`,
        `    ${name}End.setDate(${name}End.getDate() + 1);`,
        `    qb.andWhere('row.${prop} >= :${name}Start AND row.${prop} < :${name}End', {`,
        `      ${name}Start,`,
        `      ${name}End,`,
        '    });',
        '  }',
      ];
    }
    return [
      `  if (query.${name}) {`,
      `    qb.andWhere('row.${prop} LIKE :${name}', { ${name}: \`%\${query.${name}}%\` });`,
      '  }',
    ];
  });

  // 明细回显类型：字段均可空/可缺省（与 zod 的 nullable().optional() 推断一致）
  const detailTypeLines = details.map((d) => {
    const tsOf = (f: DevModelFieldInput) =>
      f.type === 'int' || f.type === 'decimal' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string';
    return `export interface ${d.entityName}Detail {` + '\n' +
      '  id?: number;\n' +
      d.fields.map((f) => `  ${f.fieldName}?: ${tsOf(f)} | null;`).join('\n') +
      '\n}';
  });

  const detailsInputType = `export interface ${className}Details {\n${details.map((d) => `  ${d.tableName}?: ${d.entityName}Detail[];`).join('\n')}\n}`;

  // 每个子表的回显：按外键查从表
  const loadDetailBlocks = details.map((d) => {
    return [
      `  {`,
      `    const rows = await AppDataSource.getRepository(${d.entityName})`,
      `      .createQueryBuilder('d')`,
      `      .where('d.${d.foreignKey} = :masterId', { masterId: id })`,
      `      .orderBy('d.id', 'ASC')`,
      `      .getMany();`,
      `    result['${d.tableName}'] = rows.map((item) => ({`,
      `      id: item.id,`,
      ...detailDtoLines(d.fields),
      `    }));`,
      `  }`,
    ].join('\n');
  });

  // 每个子表的写入：有 id 的更新、无 id 的新增、缺失的软删除
  const writeDetailBlocks = details.map((d) => {
    const repoVar = `detailRepo_${d.tableName}`;
    return [
      `  // 明细：${d.label}（${d.tableName}）`,
      `  if (details['${d.tableName}'] !== undefined) {`,
      `    const ${repoVar} = manager.getRepository(${d.entityName});`,
      `    const rows = details['${d.tableName}'] ?? [];`,
      `    const keptIds: number[] = [];`,
      `    for (const row of rows) {`,
      `      const values = {`,
      ...detailEntityLines(d.fields),
      `        ${d.foreignKey}: masterId,`,
      `      };`,
      `      if (row.id && row.id > 0) {`,
      `        await ${repoVar}.update({ id: row.id, ${d.foreignKey}: masterId } as any, values);`,
      `        keptIds.push(row.id);`,
      `      } else {`,
      `        const saved = await ${repoVar}.save(${repoVar}.create(values as any) as unknown as ${d.entityName});`,
      `        keptIds.push(saved.id);`,
      `      }`,
      `    }`,
      `    const existing = await ${repoVar}`,
      `      .createQueryBuilder('d')`,
      `      .select('d.id', 'id')`,
      `      .where('d.${d.foreignKey} = :masterId', { masterId })`,
      `      .getRawMany<{ id: number }>();`,
      `    const removed = existing.map((item) => item.id).filter((id) => !keptIds.includes(id));`,
      `    if (removed.length > 0) await ${repoVar}.softDelete(removed);`,
      `  }`,
    ].join('\n');
  });

  // 级联软删明细
  const deleteDetailBlocks = details.map((d) => {
    return [
      `    await manager.getRepository(${d.entityName})`,
      `      .createQueryBuilder()`,
      `      .softDelete()`,
      `      .where('${d.foreignKey} = :masterId', { masterId: id })`,
      `      .execute();`,
    ].join('\n');
  });

  // 列表聚合：每个子表按外键批量查出明细，聚合成 { masterId: { [tableName]: rows } }
  const aggregateBlocks = details
    .filter((d) => d.listColumns.length > 0)
    .map((d) => {
      return [
        `  {`,
        `    const rows = await AppDataSource.getRepository(${d.entityName})`,
        `      .createQueryBuilder('d')`,
        `      .where('d.${d.foreignKey} IN (:...ids)', { ids })`,
        `      .orderBy('d.id', 'ASC')`,
        `      .getMany();`,
        `    for (const item of rows) {`,
        `      const key = (item as any).${d.foreignKey} as number;`,
        `      (aggregate[key] ??= {})['${d.tableName}'] ??= [];`,
        `      (aggregate[key]['${d.tableName}'] as any[]).push({`,
        `        id: item.id,`,
        ...detailDtoLines(d.fields),
        `      });`,
        `    }`,
        `  }`,
      ].join('\n');
    });
  const aggregateFn = [
    `/** 列表用：批量聚合子表明细，避免 N+1 查询 */`,
    `async function load${className}DetailAggregates(ids: number[]): Promise<Record<number, ${className}Details>> {`,
    `  const aggregate: Record<number, ${className}Details> = {};`,
    '  if (ids.length === 0) return aggregate;',
    ...aggregateBlocks,
    '  return aggregate;',
    '}',
  ].join('\n');

  return [
    "import { In } from 'typeorm';",
    "import { AppDataSource } from '../../db/data-source';",
    `import { ${className} } from './${model.model_key}.entity';`,
    ...details.map((d) => `import { ${d.entityName} } from './${d.entityFile}';`),
    "import { AppError, ERROR_CODES } from '../../utils/app-error';",
    "import { parsePagination } from '../../utils/pagination';",
    `import type { Create${className}Input, ${className}Query, Update${className}Input } from './${model.model_key}.dto';`,
    '',
    '/** 明细字段值归一化工具 */',
    'function numberOrNull(value: unknown): number | null {',
    "  if (value === null || value === undefined || value === '') return null;",
    '  const number = Number(value);',
    '  return Number.isFinite(number) ? number : null;',
    '}',
    'function dateOrNull(value: unknown): Date | null {',
    "  if (value === null || value === undefined || value === '') return null;",
    '  const date = new Date(value as string);',
    '  return Number.isNaN(date.getTime()) ? null : date;',
    '}',
    'function toDateString(value: unknown): string {',
    '  if (!value) return \'\';',
    "  return value instanceof Date ? value.toISOString() : String(value);",
    '}',
    '',
    ...detailTypeLines,
    '',
    detailsInputType,
    '',
    'function repo() {',
    `  return AppDataSource.getRepository(${className});`,
    '}',
    '',
    `function toDto(row: ${className}) {`,
    '  return {',
    '    id: row.id,',
    ...fields.map((field) => `    ${field.fieldName}: row.${field.columnName},`),
    '    createdAt: row.createdAt,',
    '    updatedAt: row.updatedAt,',
    '  };',
    '}',
    '',
    `function toEntity(input: Create${className}Input) {`,
    '  return {',
    ...fields.map((field) => `    ${field.columnName}: ${toEntityExpression(field, 'input')},`),
    '  };',
    '}',
    '',
    ...(details.some((d) => d.listColumns.length > 0) ? [aggregateFn, ''] : []),
    '/** 按主表 id 读取全部明细 */',
    `export async function get${className}Details(id: number): Promise<${className}Details> {`,
    '  const master = await repo().findOneBy({ id });',
    "  if (!master) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');",
    `  const result: ${className}Details = {};`,
    ...loadDetailBlocks,
    '  return result;',
    '}',
    '',
    `export async function list${className}(query: ${className}Query) {`,
    '  const { page, pageSize } = parsePagination(query as Record<string, unknown>);',
    '  const qb = repo()',
    "    .createQueryBuilder('row')",
    "    .orderBy('row.createdAt', 'DESC')",
    '    .skip((page - 1) * pageSize)',
    '    .take(pageSize);',
    ...(searchField
      ? [
          '  if (query.keyword) {',
          `    qb.andWhere('row.${searchField.columnName} LIKE :keyword', { keyword: \`%\${query.keyword}%\` });`,
          '  }',
        ]
      : []),
    ...queryConditions,
    '  const [rows, total] = await qb.getManyAndCount();',
    ...(details.some((d) => d.listColumns.length > 0)
      ? [
          '  const ids = rows.map((row) => row.id);',
          `  const detailMap = await load${className}DetailAggregates(ids);`,
          '  const list = rows.map((row) => ({ ...toDto(row), details: detailMap[row.id] ?? {} }));',
          '  return { list, total, page, pageSize };',
        ]
      : ['  return { list: rows.map(toDto), total, page, pageSize };']),
    '}',
    '',
    `export async function get${className}(id: number) {`,
    '  const row = await repo().findOneBy({ id });',
    "  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '数据不存在');",
    '  return toDto(row);',
    '}',
    '',
    `export async function create${className}(input: Create${className}Input) {`,
    '  const saved = await AppDataSource.manager.transaction(async (manager) => {',
    `    const row = manager.create(${className}, toEntity(input));`,
    '    await manager.save(row);',
    `    await write${className}Details(manager, row.id, input.details);`,
    '    return row;',
    '  });',
    '  return toDto(saved);',
    '}',
    '',
    `export async function update${className}(id: number, input: Update${className}Input) {`,
    `  await get${className}(id);`,
    '  await AppDataSource.manager.transaction(async (manager) => {',
    `    const patch: Partial<${className}> = {`,
    ...fields.map(
      (field) =>
        `      ...(input.${field.fieldName} !== undefined ? { ${field.columnName}: ${toEntityExpression(field, 'input')} } : {}),`,
    ),
    '    };',
    '    if (Object.keys(patch).length > 0) await manager.update(' + className + ', id, patch as any);',
    `    await write${className}Details(manager, id, input.details);`,
    '  });',
    `  return get${className}(id);`,
    '}',
    '',
    `export async function delete${className}(id: number) {`,
    `  await get${className}(id);`,
    '  await AppDataSource.manager.transaction(async (manager) => {',
    ...deleteDetailBlocks,
    `    await manager.getRepository(${className}).delete({ id });`,
    '  });',
    '}',
    '',
    `/** 同事务写入明细：前端提交哪个子表就同步哪个子表 */`,
    `async function write${className}Details(manager: import('typeorm').EntityManager, masterId: number, details?: NonNullable<Create${className}Input['details']>): Promise<void> {`,
    '  if (!details) return;',
    ...writeDetailBlocks,
    '}',
    '',
  ].join('\n');
}

function generateController(model: TableCodegenModel, hasDetails = false): string {
  const className = toPascal(model.model_key);
  return [
    "import type { Request } from 'express';",
    "import { ok } from '../../utils/response';",
    `import type { Create${className}Input, ${className}Query, Update${className}Input } from './${model.model_key}.dto';`,
    `import { create${className}, delete${className}, get${className}, list${className}, update${className}${hasDetails ? `, get${className}Details` : ''} } from './${model.model_key}.service';`,
    '',
    `export async function list${className}Controller(req: Request) {`,
    `  return ok(await list${className}(req.query as unknown as ${className}Query));`,
    '}',
    '',
    `export async function get${className}Controller(req: Request) {`,
    `  return ok(await get${className}(Number(req.params.id)));`,
    '}',
    '',
    ...(hasDetails
      ? [
          `export async function get${className}DetailsController(req: Request) {`,
          `  return ok(await get${className}Details(Number(req.params.id)));`,
          '}',
          '',
        ]
      : []),
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

function generateRoute(model: TableCodegenModel, hasDetails = false): string {
  const className = toPascal(model.model_key);
  const camel = toCamel(model.model_key);
  const perm = `biz_${model.model_key}`;
  return [
    "import { Router } from 'express';",
    "import { hasPerm } from '../../middlewares/auth';",
    "import { validateBody, validateQuery } from '../../middlewares/validate';",
    "import { asyncHandler } from '../../utils/async-handler';",
    `import { create${className}Controller, delete${className}Controller, get${className}Controller, list${className}Controller, update${className}Controller${hasDetails ? `, get${className}DetailsController` : ''} } from './${model.model_key}.controller';`,
    `import { create${className}Schema, ${camel}QuerySchema, update${className}Schema } from './${model.model_key}.dto';`,
    '',
    `export const ${camel}Router = Router();`,
    '',
    `${camel}Router.get('/', hasPerm('${perm}:list'), validateQuery(${camel}QuerySchema), asyncHandler(async (req, res) => {`,
    `  res.json(await list${className}Controller(req));`,
    '}));',
    '',
    `${camel}Router.post('/', hasPerm('${perm}:create'), validateBody(create${className}Schema), asyncHandler(async (req, res) => {`,
    `  res.json(await create${className}Controller(req));`,
    '}));',
    '',
    `${camel}Router.get('/:id', hasPerm('${perm}:list'), asyncHandler(async (req, res) => {`,
    `  res.json(await get${className}Controller(req));`,
    '}));',
    '',
    ...(hasDetails
      ? [
          `${camel}Router.get('/:id/details', hasPerm('${perm}:list'), asyncHandler(async (req, res) => {`,
          `  res.json(await get${className}DetailsController(req));`,
          '}));',
          '',
        ]
      : []),
    `${camel}Router.put('/:id', hasPerm('${perm}:update'), validateBody(update${className}Schema), asyncHandler(async (req, res) => {`,
    `  res.json(await update${className}Controller(req));`,
    '}));',
    '',
    `${camel}Router.delete('/:id', hasPerm('${perm}:delete'), asyncHandler(async (req, res) => {`,
    `  res.json(await delete${className}Controller(req));`,
    '}));',
    '',
  ].join('\n');
}

function generateFrontendApi(
  model: TableCodegenModel,
  fields: DevModelFieldInput[],
  queryFields: DevModelFieldInput[] = [],
  details: DetailsCodegenInput = [],
): string {
  const className = toPascal(model.model_key);
  const hasDetails = details.length > 0;
  const detailTypeLines = details.map((d) => {
    const fields = d.fields.map((f) => {
      const ts = f.type === 'int' || f.type === 'decimal' ? 'number' : f.type === 'boolean' ? 'boolean' : 'string';
      return `  ${f.fieldName}: ${ts} | null;`;
    });
    return `export interface ${d.entityName}Detail {\n  id?: number;\n${fields.join('\n')}\n}`;
  });
  const detailsInterface = hasDetails
    ? `export interface ${className}Details {\n${details.map((d) => `  ${d.tableName}?: ${d.entityName}Detail[];`).join('\n')}\n}`
    : '';
  return [
    "import type { PageResult } from '@/types/api';",
    "import { http } from '@/api/request';",
    '',
    ...(hasDetails ? [detailTypeLines.join('\n\n'), '', detailsInterface, ''] : []),
    `export interface ${className}Item {`,
    '  id: number;',
    ...fields.map((field) => `  ${field.fieldName}: ${itemType(field)};`),
    '  createdAt: string;',
    '  updatedAt: string;',
    '}',
    '',
    `export interface ${className}Payload {`,
    ...fields.map(
      (field) => `  ${field.fieldName}${field.nullable ? '?' : ''}: ${payloadType(field)};`,
    ),
    ...(hasDetails ? [`  details?: ${className}Details;`] : []),
    '}',
    '',
    `export interface ${className}Query {`,
    '  page?: number;',
    '  pageSize?: number;',
    '  keyword?: string;',
    ...queryFields.map((field) => {
      const type =
        field.type === 'int' || field.type === 'decimal'
          ? 'number'
          : field.type === 'boolean'
            ? "'true' | 'false'"
            : 'string';
      return `  ${field.fieldName}?: ${type};`;
    }),
    '  [key: string]: unknown;',
    '}',
    '',
    `export function list${className}(params: ${className}Query): Promise<PageResult<${className}Item>> {`,
    `  return http.get<PageResult<${className}Item>>('/admin/${model.model_key}', { params });`,
    '}',
    '',
    `export function get${className}(id: number): Promise<${className}Item> {`,
    `  return http.get<${className}Item>(\`/admin/${model.model_key}/\${id}\`);`,
    '}',
    '',
    ...(hasDetails
      ? [
          `export function get${className}Details(id: number): Promise<${className}Details> {`,
          `  return http.get<${className}Details>(\`/admin/${model.model_key}/\${id}/details\`);`,
          '}',
          '',
        ]
      : []),
    `export function create${className}(payload: ${className}Payload): Promise<${className}Item> {`,
    `  return http.post<${className}Item>('/admin/${model.model_key}', payload);`,
    '}',
    '',
    `export function update${className}(id: number, payload: Partial<${className}Payload>): Promise<${className}Item> {`,
    `  return http.put<${className}Item>(\`/admin/${model.model_key}/\${id}\`, payload);`,
    '}',
    '',
    `export function delete${className}(id: number): Promise<null> {`,
    `  return http.delete<null>(\`/admin/${model.model_key}/\${id}\`);`,
    '}',
    '',
  ].join('\n');
}

function generateFrontendPage(model: DevModel, fields: DevModelFieldInput[]): string {
  const className = toPascal(model.model_key);
  const listFields = fields.filter((field) => field.listVisible);
  const formFields = fields.filter((field) => field.formVisible);
  const usesDate = listFields.some((field) => field.type === 'date');
  const usesDateTime = listFields.some((field) => field.type === 'datetime');
  const usesDateTimeInput = formFields.some((field) => field.type === 'datetime');
  const dateImports = [
    ...(usesDate ? ['formatDate'] : []),
    ...(usesDateTime ? ['formatDateTime'] : []),
    ...(usesDateTimeInput ? ['toLocalDateTimeInput'] : []),
  ];

  return [
    '<script setup lang="ts">',
    `defineOptions({ name: 'Biz${className}' });`,
    '',
    "import { reactive, ref } from 'vue';",
    "import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';",
    "import ProTable from '@/components/ProTable/index.vue';",
    "import type { ProTableColumn, SearchItem } from '@/components/ProTable/types';",
    "import AppDialog from '@/components/AppDialog/index.vue';",
    `import { create${className}, delete${className}, list${className}, update${className}, type ${className}Item, type ${className}Payload, type ${className}Query } from './api';`,
    ...(dateImports.length > 0
      ? [`import { ${dateImports.join(', ')} } from '@/utils/datetime';`]
      : []),
    '',
    'const tableRef = ref<any>(null);',
    '',
    'const columns: ProTableColumn[] = [',
    "  { type: 'index', label: '序号', width: 70 },",
    ...listFields.map(listColumn),
    "  { label: '操作', width: 160, fixed: 'right', slot: 'actions' },",
    '];',
    '',
    "const searchItems: SearchItem[] = [{ prop: 'keyword', label: '关键字', placeholder: '请输入关键字' }];",
    '',
    'function loadData(params: Record<string, unknown>) {',
    `  return list${className}(params as ${className}Query);`,
    '}',
    '',
    'const dialogVisible = ref(false);',
    "const dialogMode = ref<'create' | 'edit'>('create');",
    'const editingId = ref<number | null>(null);',
    'const saving = ref(false);',
    'const formRef = ref<FormInstance>();',
    '',
    `const form = reactive<${className}Payload>({`,
    ...formFields.map((field) => `  ${field.fieldName}: ${initialValue(field)},`),
    '});',
    '',
    'const rules: FormRules = {',
    ...formFields.map(fieldRule).filter(Boolean),
    '};',
    '',
    'function resetForm(): void {',
    ...formFields.map((field) => `  form.${field.fieldName} = ${initialValue(field)};`),
    "  formRef.value?.clearValidate();",
    '}',
    '',
    'function openCreate(): void {',
    "  dialogMode.value = 'create';",
    '  editingId.value = null;',
    '  resetForm();',
    '  dialogVisible.value = true;',
    '}',
    '',
    `function openEdit(row: ${className}Item): void {`,
    "  dialogMode.value = 'edit';",
    '  editingId.value = row.id;',
    '  resetForm();',
    ...formFields.map(editAssign),
    '  dialogVisible.value = true;',
    '}',
    '',
    'async function handleSave(): Promise<void> {',
    '  if (!formRef.value) return;',
    "  const valid = await formRef.value.validate().catch(() => false);",
    '  if (!valid) return;',
    '',
    '  saving.value = true;',
    '  try {',
    "    if (dialogMode.value === 'create') {",
    `      await create${className}({ ...form });`,
    "      ElMessage.success('创建成功');",
    '    } else if (editingId.value) {',
    `      await update${className}(editingId.value, { ...form });`,
    "      ElMessage.success('更新成功');",
    '    }',
    '    dialogVisible.value = false;',
    '    tableRef.value?.reload();',
    '  } finally {',
    '    saving.value = false;',
    '  }',
    '}',
    '',
    `async function handleDelete(row: ${className}Item): Promise<void> {`,
    `  try {`,
    `    await ElMessageBox.confirm('确定删除该条数据吗？', '删除确认', {`,
    "      type: 'warning',",
    "      confirmButtonText: '删除',",
    "      confirmButtonClass: 'el-button--danger',",
    '    });',
    '  } catch {',
    '    return;',
    '  }',
    '  try {',
    `    await delete${className}(row.id);`,
    "    ElMessage.success('删除成功');",
    '    tableRef.value?.reload();',
    '  } catch {',
    '    // 错误提示由 request 拦截器统一处理',
    '  }',
    '}',
    '</script>',
    '',
    '<template>',
    '  <div class="page">',
    '    <ProTable ref="tableRef" :columns="columns" :search-items="searchItems" :request="loadData" row-key="id">',
    '      <template #toolbar>',
    "        <el-button v-permission=\"'biz_" + model.model_key + ":create'\" type=\"primary\" @click=\"openCreate\">新增</el-button>",
    '      </template>',
    '',
    '      <template #actions="{ row }">',
    "        <el-button v-permission=\"'biz_" + model.model_key + ":update'\" link type=\"primary\" @click=\"openEdit(row)\">编辑</el-button>",
    "        <el-button v-permission=\"'biz_" + model.model_key + ":delete'\" link type=\"danger\" @click=\"handleDelete(row)\">删除</el-button>",
    '      </template>',
    '    </ProTable>',
    '',
    '    <AppDialog v-model="dialogVisible" :title="dialogMode === \'create\' ? \'新增\' : \'编辑\'" width="640px">',
    '      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">',
    ...formFields.map((field) =>
      [
        `        <el-form-item label="${html(field.label)}" prop="${field.fieldName}">`,
        `          ${fieldControl(field)}`,
        '        </el-form-item>',
      ].join('\n'),
    ),
    '      </el-form>',
    '      <template #footer>',
    '        <el-button @click="dialogVisible = false">取消</el-button>',
    '        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>',
    '      </template>',
    '    </AppDialog>',
    '  </div>',
    '</template>',
    '',
  ].join('\n');
}

function generateGuide(
  model: DevModel,
  connection: DevDataSource,
  fields: DevModelFieldInput[],
): string {
  const className = toPascal(model.model_key);
  const key = model.model_key;
  const perm = `biz_${key}`;
  return [
    `# ${model.name}（${key}）接入说明`,
    '',
    `- 数据连接：${connection.name}（${connection.db_type}）`,
    `- 目标表：${model.table_name}`,
    `- 字段数：${fields.length}`,
    '',
    '## 生成文件',
    '',
    '```text',
    `server/src/biz/${key}/${key}.entity.ts`,
    `server/src/biz/${key}/${key}.dto.ts`,
    `server/src/biz/${key}/${key}.service.ts`,
    `server/src/biz/${key}/${key}.controller.ts`,
    `server/src/biz/${key}/${key}.route.ts`,
    `server/src/biz/${key}/migration.sql`,
    `admin/src/views/biz/${key}/index.vue`,
    `admin/src/views/biz/${key}/api.ts`,
    '```',
    '',
    '## 落地方式',
    '',
    '1. 把 zip 解压到项目根目录（保持 `server/` 与 `admin/` 两层即可），文件自动落到上面两个目录。',
    '2. 重启后端。`server/src/biz` 启动时会自动扫描每个模块目录：',
    `   - \`${key}.entity.ts\` → 注册到 TypeORM；`,
    `   - \`${key}.route.ts\` → 挂载到 \`/api/admin/${key}\`。`,
    '   不需要改 `server/src/app.ts`，也不需要改 `server/src/db/entities/index.ts`。',
    `3. 前端菜单组件路径填 \`biz/${key}/index\`，路由表由 \`views/**/*.vue\` 自动收集。`,
    '',
    '## 菜单与权限',
    '',
    '```text',
    `页面权限：${perm}:list`,
    `按钮权限：${perm}:create / ${perm}:update / ${perm}:delete`,
    `菜单组件：biz/${key}/index`,
    `菜单路径：/biz/${key}`,
    '```',
    '',
    '维护菜单后执行 `pnpm seed` 生效。',
    '',
    '## 注意',
    '',
    '- 表已在目标库创建；`migration.sql` 仅作留档，不需要重复执行。',
    '  如未执行建表，请先到「数据建模」点击「执行建表」或手工执行该 SQL。',
    '- 页面已包含 ProTable 列表 + 新增/编辑弹窗 + 删除，组件名 `Biz' + className + '`，与 keep-alive 约定一致。',
    '- 生成代码基于当前字段配置；后续改表结构需重新生成并 review。',
    '- decimal 已带 transformer 转 number；date 返回字符串，datetime 返回 Date。',
    '- 生产环境必须关闭 synchronize，使用 migration 管理表结构。',
    '',
  ].join('\n');
}

/** 表单设计关联数据表时复用这套后端 CRUD 生成；details 非空时生成带明细的版本 */
export function generateTableBackendFiles(
  model: TableCodegenModel,
  fields: DevModelFieldInput[],
  queryFields: DevModelFieldInput[] = [],
  details: DetailsCodegenInput = [],
): GeneratedFile[] {
  const key = model.model_key;
  const hasDetails = details.length > 0;
  const mainEntity = [
    generateEntity(model, fields),
    ...(hasDetails
      ? ['', '// 明细从表实体：re-export 之后 biz 启动扫描会随主实体一起注册', ...details.map((d) => `export { ${d.entityName} } from './${d.entityFile}';`)]
      : []),
  ].join('\n');
  const files: GeneratedFile[] = [
    {
      name: `server/src/biz/${key}/${key}.entity.ts`,
      language: 'ts',
      content: mainEntity,
    },
    {
      name: `server/src/biz/${key}/${key}.dto.ts`,
      language: 'ts',
      content: generateDto(model, fields, queryFields, details),
    },
    {
      name: `server/src/biz/${key}/${key}.service.ts`,
      language: 'ts',
      content: hasDetails
        ? generateServiceWithDetails(model, fields, details, queryFields)
        : generateService(model, fields, queryFields),
    },
    {
      name: `server/src/biz/${key}/${key}.controller.ts`,
      language: 'ts',
      content: generateController(model, hasDetails),
    },
    {
      name: `server/src/biz/${key}/${key}.route.ts`,
      language: 'ts',
      content: generateRoute(model, hasDetails),
    },
  ];
  // 每个从表生成一个独立 entity（类名与文件由 form codegen 约定）
  for (const detail of details) {
    files.push({
      name: `server/src/biz/${key}/${detail.entityFile}.ts`,
      language: 'ts',
      content: generateEntity(
        { name: detail.label, model_key: detail.entityName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(), table_name: detail.tableName, table_comment: detail.label },
        detail.entityFields,
      ),
    });
  }
  return files;
}

export function generateTableFrontendApiFile(
  model: TableCodegenModel,
  fields: DevModelFieldInput[],
  queryFields: DevModelFieldInput[] = [],
  details: DetailsCodegenInput = [],
): GeneratedFile {
  return {
    name: `admin/src/views/biz/${model.model_key}/api.ts`,
    language: 'ts',
    content: generateFrontendApi(model, fields, queryFields, details),
  };
}

export function generateDevModelCode(
  model: DevModel,
  connection: DevDataSource,
  fields: DevModelFieldInput[],
): GeneratedFile[] {
  const statements = buildCreateTableStatements(
    connection.db_type,
    model.table_name,
    model.table_comment ?? model.name,
    fields,
  );

  return [
    {
      name: `server/src/biz/${model.model_key}/${model.model_key}.entity.ts`,
      language: 'ts',
      content: generateEntity(model, fields),
    },
    {
      name: `server/src/biz/${model.model_key}/${model.model_key}.dto.ts`,
      language: 'ts',
      content: generateDto(model, fields),
    },
    {
      name: `server/src/biz/${model.model_key}/${model.model_key}.service.ts`,
      language: 'ts',
      content: generateService(model, fields),
    },
    {
      name: `server/src/biz/${model.model_key}/${model.model_key}.controller.ts`,
      language: 'ts',
      content: generateController(model),
    },
    {
      name: `server/src/biz/${model.model_key}/${model.model_key}.route.ts`,
      language: 'ts',
      content: generateRoute(model),
    },
    {
      name: `server/src/biz/${model.model_key}/migration.sql`,
      language: 'sql',
      content: formatSql(statements),
    },
    {
      name: `admin/src/views/biz/${model.model_key}/index.vue`,
      language: 'vue',
      content: generateFrontendPage(model, fields),
    },
    {
      name: `admin/src/views/biz/${model.model_key}/api.ts`,
      language: 'ts',
      content: generateFrontendApi(model, fields),
    },
    {
      name: `server/src/biz/${model.model_key}/README.md`,
      language: 'markdown',
      content: generateGuide(model, connection, fields),
    },
  ];
}
