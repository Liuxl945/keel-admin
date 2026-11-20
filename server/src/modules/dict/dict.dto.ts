import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

const statusSchema = z.enum(['ENABLED', 'DISABLED']);
const tagTypeSchema = z.enum(['primary', 'success', 'info', 'warning', 'danger']);

export const dictTypeQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  status: statusSchema.optional(),
});

export const createDictTypeSchema = z.object({
  dictName: z.string().trim().min(1, '请输入字典名称').max(100, '字典名称不能超过 100'),
  dictType: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,99}$/, '字典类型需为小写字母开头，仅含小写字母、数字、下划线'),
  status: statusSchema.default('ENABLED'),
  remark: z.string().trim().max(500, '备注不能超过 500').optional().nullable(),
});

export const updateDictTypeSchema = z.object({
  dictName: z.string().trim().min(1, '请输入字典名称').max(100, '字典名称不能超过 100').optional(),
  status: statusSchema.optional(),
  remark: z.string().trim().max(500, '备注不能超过 500').optional().nullable(),
});

export const dictDataQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  dictType: z.string().trim().max(100).optional(),
  label: z.string().trim().max(100).optional(),
  status: statusSchema.optional(),
});

export const createDictDataSchema = z.object({
  dictType: z.string().trim().min(1, '请选择字典类型').max(100),
  dictLabel: z.string().trim().min(1, '请输入标签').max(100, '标签不能超过 100'),
  dictValue: z.string().trim().min(1, '请输入数据值').max(100, '数据值不能超过 100'),
  dictSort: z.coerce.number().int().min(0).max(9999).default(0),
  tagType: tagTypeSchema.default('primary'),
  status: statusSchema.default('ENABLED'),
  remark: z.string().trim().max(500, '备注不能超过 500').optional().nullable(),
});

export const updateDictDataSchema = z.object({
  dictLabel: z.string().trim().min(1, '请输入标签').max(100, '标签不能超过 100').optional(),
  dictValue: z.string().trim().min(1, '请输入数据值').max(100, '数据值不能超过 100').optional(),
  dictSort: z.coerce.number().int().min(0).max(9999).optional(),
  tagType: tagTypeSchema.optional(),
  status: statusSchema.optional(),
  remark: z.string().trim().max(500, '备注不能超过 500').optional().nullable(),
});

export type DictTypeQuery = z.infer<typeof dictTypeQuerySchema>;
export type CreateDictTypeInput = z.infer<typeof createDictTypeSchema>;
export type UpdateDictTypeInput = z.infer<typeof updateDictTypeSchema>;
export type DictDataQuery = z.infer<typeof dictDataQuerySchema>;
export type CreateDictDataInput = z.infer<typeof createDictDataSchema>;
export type UpdateDictDataInput = z.infer<typeof updateDictDataSchema>;
