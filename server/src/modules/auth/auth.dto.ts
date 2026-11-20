import { z } from 'zod';

export const adminLoginSchema = z.object({
  username: z
    .string({ required_error: '请输入账号' })
    .trim()
    .min(1, '请输入账号')
    .max(50, '账号长度不能超过 50'),
  password: z.string({ required_error: '请输入密码' }).min(1, '请输入密码').max(100, '密码长度不能超过 100'),
  captchaId: z
    .string({ required_error: '请先获取验证码' })
    .trim()
    .min(1, '请先获取验证码')
    .max(64),
  captchaCode: z
    .string({ required_error: '请输入验证码' })
    .trim()
    .min(1, '请输入验证码')
    .max(10, '验证码格式不正确'),
});

export const refreshSchema = z.object({
  refreshToken: z.string({ required_error: '缺少刷新令牌' }).min(1, '缺少刷新令牌'),
});

export const appLoginSchema = z.object({
  code: z
    .string({ required_error: '缺少微信登录 code' })
    .trim()
    .min(1, '缺少微信登录 code')
    .max(200),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AppLoginInput = z.infer<typeof appLoginSchema>;
