import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

export const dataSourceTypeSchema = z.enum(['mysql', 'postgres']);

export const createDataSourceSchema = z.object({
  name: z.string().trim().min(1, '请输入连接名称').max(100, '连接名称不能超过 100'),
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,49}$/, '连接编码需为 snake_case，小写字母开头，2-50 位'),
  dbType: dataSourceTypeSchema,
  host: z.string().trim().min(1, '请输入主机地址').max(255),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  databaseName: z.string().trim().min(1, '请输入数据库名').max(100),
  username: z.string().trim().min(1, '请输入用户名').max(100),
  password: z.string().max(200, '密码不能超过 200').optional().default(''),
  status: z.enum(['ENABLED', 'DISABLED']).optional().default('ENABLED'),
  isDefault: z.boolean().optional().default(false),
  remark: z.string().trim().max(500, '备注不能超过 500').optional().nullable(),
});

export const updateDataSourceSchema = z
  .object({
    name: z.string().trim().min(1, '请输入连接名称').max(100).optional(),
    host: z.string().trim().min(1, '请输入主机地址').max(255).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    databaseName: z.string().trim().min(1, '请输入数据库名').max(100).optional(),
    username: z.string().trim().min(1, '请输入用户名').max(100).optional(),
    // 留空表示不修改密码
    password: z.string().max(200, '密码不能超过 200').optional(),
    status: z.enum(['ENABLED', 'DISABLED']).optional(),
    isDefault: z.boolean().optional(),
    remark: z.string().trim().max(500, '备注不能超过 500').optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' });

export const dataSourceQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  dbType: dataSourceTypeSchema.optional(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
});

export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>;
export type UpdateDataSourceInput = z.infer<typeof updateDataSourceSchema>;
export type DataSourceQuery = z.infer<typeof dataSourceQuerySchema>;
