import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

const emailSchema = z
  .string()
  .trim()
  .max(100, '邮箱长度不能超过 100')
  .refine((value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), '邮箱格式不正确')
  .optional()
  .nullable();

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,30}$/, '账号需为 3-30 位字母、数字或下划线'),
  password: z.string().min(8, '密码至少 8 位').max(100, '密码长度不能超过 100'),
  nickname: z.string().trim().min(1, '请输入昵称').max(50, '昵称长度不能超过 50'),
  avatar: z.string().trim().max(500).optional().nullable(),
  email: emailSchema,
  phone: z.string().trim().max(20, '手机号长度不能超过 20').optional().nullable(),
  status: z.enum(['ENABLED', 'DISABLED']).default('ENABLED'),
  roleIds: z.array(z.coerce.number().int().positive()).default([]),
});

export const updateUserSchema = z.object({
  nickname: z.string().trim().min(1, '请输入昵称').max(50, '昵称长度不能超过 50').optional(),
  avatar: z.string().trim().max(500).optional().nullable(),
  email: emailSchema,
  phone: z.string().trim().max(20, '手机号长度不能超过 20').optional().nullable(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(z.coerce.number().int().positive()).max(50, '角色数量过多'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(100, '密码长度不能超过 100'),
});

export const updateStatusSchema = z.object({
  status: z.enum(['ENABLED', 'DISABLED'], { errorMap: () => ({ message: '状态只能是 ENABLED 或 DISABLED' }) }),
});

export const userQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  keyword: z.string().trim().max(50).optional(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
