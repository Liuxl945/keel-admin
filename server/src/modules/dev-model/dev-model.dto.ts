import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

export const DEV_MODEL_FIELD_TYPES = [
  'varchar',
  'text',
  'int',
  'decimal',
  'boolean',
  'date',
  'datetime',
] as const;

export type DevModelFieldType = (typeof DEV_MODEL_FIELD_TYPES)[number];

const RESERVED_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);
const RESERVED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt']);

export const devModelFieldSchema = z.object({
  label: z.string().trim().min(1, '请输入字段说明').max(100, '字段说明不能超过 100'),
  columnName: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, '列名需为 snake_case，小写字母开头，最多 64 位'),
  fieldName: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9]{0,49}$/, '字段名需为小驼峰，如 userName'),
  type: z.enum(DEV_MODEL_FIELD_TYPES),
  length: z.coerce.number().int().min(1).max(2000).optional().default(255),
  precision: z.coerce.number().int().min(1).max(65).optional().default(10),
  scale: z.coerce.number().int().min(0).max(30).optional().default(2),
  nullable: z.boolean().optional().default(true),
  unique: z.boolean().optional().default(false),
  listVisible: z.boolean().optional().default(true),
  formVisible: z.boolean().optional().default(true),
  searchable: z.boolean().optional().default(false),
});

export const devModelSchema = z
  .object({
    name: z.string().trim().min(1, '请输入模型名称').max(100, '模型名称不能超过 100'),
    modelKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{2,49}$/, '模型编码需为 snake_case，小写字母开头，2-50 位'),
    connectionId: z.coerce.number().int().positive('请选择数据连接'),
    tableName: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,63}$/, '表名需为 snake_case，小写字母开头，最多 64 位'),
    tableComment: z.string().trim().max(255, '表注释不能超过 255').optional().nullable(),
    fields: z.array(devModelFieldSchema).max(100, '最多 100 个字段'),
  })
  .superRefine((model, ctx) => {
    const columns = new Set<string>();
    const fields = new Set<string>();

    model.fields.forEach((field, index) => {
      if (RESERVED_COLUMNS.has(field.columnName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `列名 ${field.columnName} 为系统保留字段`,
          path: ['fields', index, 'columnName'],
        });
      }
      if (RESERVED_FIELDS.has(field.fieldName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `字段名 ${field.fieldName} 为系统保留字段`,
          path: ['fields', index, 'fieldName'],
        });
      }
      if (columns.has(field.columnName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `列名重复：${field.columnName}`,
          path: ['fields', index, 'columnName'],
        });
      }
      if (fields.has(field.fieldName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `字段名重复：${field.fieldName}`,
          path: ['fields', index, 'fieldName'],
        });
      }
      columns.add(field.columnName);
      fields.add(field.fieldName);
    });

    // 列表/表单/搜索的展示配置属于表单设计器，建表只校验数据库结构本身
  });

export const updateDevModelSchema = z
  .object({
    name: z.string().trim().min(1, '请输入模型名称').max(100).optional(),
    connectionId: z.coerce.number().int().positive().optional(),
    tableName: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,63}$/, '表名需为 snake_case，小写字母开头，最多 64 位')
      .optional(),
    tableComment: z.string().trim().max(255, '表注释不能超过 255').optional().nullable(),
    fields: z.array(devModelFieldSchema).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' });

export const importExistingModelSchema = z.object({
  name: z.string().trim().min(1, '请输入模型名称').max(100, '模型名称不能超过 100'),
  modelKey: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,49}$/, '模型编码需为 snake_case，小写字母开头，2-50 位'),
  connectionId: z.coerce.number().int().positive('请选择数据连接'),
  tableName: z.string().trim().min(1, '请选择数据库表').max(128),
});

export const devModelQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  status: z.enum(['DRAFT', 'CREATED']).optional(),
  // 模型列表按连接隔离，必须明确选择连接，避免跨库误操作
  connectionId: z.coerce.number().int().positive('请选择数据连接'),
});

export type DevModelFieldInput = z.infer<typeof devModelFieldSchema>;
export type DevModelSchemaInput = z.infer<typeof devModelSchema>;
export type ImportExistingModelInput = z.infer<typeof importExistingModelSchema>;
export type UpdateDevModelInput = z.infer<typeof updateDevModelSchema>;
export type DevModelQuery = z.infer<typeof devModelQuerySchema>;
