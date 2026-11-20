import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .max(100, '邮箱长度不能超过 100')
  .refine((value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), '邮箱格式不正确')
  .optional()
  .nullable();

export const updateProfileSchema = z
  .object({
    nickname: z.string().trim().min(1, '请输入昵称').max(50, '昵称不能超过 50').optional(),
    avatar: z.string().trim().max(500).optional().nullable(),
    email: emailSchema,
    phone: z.string().trim().max(20, '手机号长度不能超过 20').optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' });

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, '请输入原密码').max(100),
    newPassword: z.string().min(8, '新密码至少 8 位').max(100, '新密码不能超过 100'),
  })
  .refine((value) => value.oldPassword !== value.newPassword, {
    message: '新密码不能与原密码相同',
    path: ['newPassword'],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
