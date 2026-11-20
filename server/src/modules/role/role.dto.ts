import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

export const roleQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(50).optional(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, '请输入角色名称').max(50, '角色名称不能超过 50'),
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,49}$/, '角色编码需为小写字母开头，仅含小写字母、数字、下划线'),
  description: z.string().trim().max(255, '描述不能超过 255').optional().nullable(),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(['ENABLED', 'DISABLED']).default('ENABLED'),
});

export const updateRoleSchema = createRoleSchema
  .omit({ code: true })
  .partial();

export const assignMenusSchema = z.object({
  menuIds: z.array(z.coerce.number().int().positive()).max(500, '菜单数量过多'),
});

export type RoleQuery = z.infer<typeof roleQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
