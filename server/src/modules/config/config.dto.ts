import { z } from 'zod';

export const updateConfigsSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().trim().min(1, '配置键不能为空').max(100),
        value: z.string().max(20000, '配置值过长'),
      }),
    )
    .min(1, '至少提交一项配置')
    .max(100, '单次最多提交 100 项配置'),
});

export type UpdateConfigsInput = z.infer<typeof updateConfigsSchema>;
