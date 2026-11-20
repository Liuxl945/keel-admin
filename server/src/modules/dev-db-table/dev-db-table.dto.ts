import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

export const syncedTableQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  connectionId: z.coerce.number().int().positive().optional(),
  keyword: z.string().trim().max(100).optional(),
});

export type SyncedTableQuery = z.infer<typeof syncedTableQuerySchema>;
