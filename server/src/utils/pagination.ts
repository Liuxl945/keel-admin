import { z } from 'zod';

/** 与后台 ProTable 分页选项保持一致 */
export const MAX_PAGE_SIZE = 200;

export const pageQuerySchema = z.coerce
  .number({ invalid_type_error: '页码必须是数字' })
  .int('页码必须是整数')
  .min(1, '页码最小为 1')
  .default(1);

export const pageSizeQuerySchema = z.coerce
  .number({ invalid_type_error: '每页条数必须是数字' })
  .int('每页条数必须是整数')
  .min(1, '每页条数最小为 1')
  .max(MAX_PAGE_SIZE, `每页条数不能超过 ${MAX_PAGE_SIZE}`)
  .default(20);

/** 宽容版：用于非核心列表，非法值回退，超上限钳制 */
export function loosePageSizeSchema(fallback = 20) {
  return z
    .preprocess(
      (value) => (value === undefined || value === null || value === '' ? fallback : value),
      z.coerce.number().int().positive(),
    )
    .transform((value) => Math.min(value, MAX_PAGE_SIZE));
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export function parsePagination(query: Record<string, unknown>): Pagination {
  const page = pageQuerySchema.safeParse(query.page);
  const pageSize = pageSizeQuerySchema.safeParse(query.pageSize);
  return {
    page: page.success ? page.data : 1,
    pageSize: pageSize.success ? pageSize.data : 20,
  };
}

/** 批量操作统一口径：上限 200，服务端宽容处理不存在的 id */
export const batchDeleteSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, '请选择要操作的数据').max(200, '单次最多操作 200 条'),
});
