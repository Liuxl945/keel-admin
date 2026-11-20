import { z } from 'zod';

const nullableParentId = z
  .union([z.coerce.number().int().positive(), z.null()])
  .optional()
  .default(null);

/**
 * 严格两段式「模块:动作」：模块名本身不允许再带冒号。
 * 有层级的模块名用下划线连接：dev_form:list、dev_api:publish、biz_ddlb:create。
 */
const PERM_PATTERN = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

const permSchema = z
  .string()
  .trim()
  .max(100, '权限标识不能超过 100')
  .regex(PERM_PATTERN, '权限标识格式应为 模块:动作（仅一个冒号），如 user:list、dev_form:list');

const menuFields = {
  parentId: nullableParentId,
  name: z.string().trim().min(1, '请输入菜单名称').max(50, '菜单名称不能超过 50'),
  type: z.enum(['DIR', 'MENU', 'BUTTON', 'FORM'], {
    errorMap: () => ({ message: '菜单类型只能是 DIR/MENU/BUTTON/FORM' }),
  }),
  path: z.string().trim().max(200).optional().nullable(),
  component: z.string().trim().max(200).optional().nullable(),
  perm: permSchema.optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  sort: z.coerce.number().int().min(0).max(9999).optional(),
  visible: z.boolean().optional(),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
  // type=FORM 时必填，指向一条已发布的在线表单
  formId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
};

export const createMenuSchema = z.object({
  ...menuFields,
  sort: z.coerce.number().int().min(0).max(9999).default(0),
  visible: z.boolean().default(true),
  status: z.enum(['ENABLED', 'DISABLED']).default('ENABLED'),
});

export const updateMenuSchema = z.object(menuFields).partial();

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
