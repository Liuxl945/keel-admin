import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

export const operationLogQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  username: z.string().trim().max(50).optional(),
  path: z.string().trim().max(200).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  startTime: z.string().trim().max(30).optional(),
  endTime: z.string().trim().max(30).optional(),
});

export const loginLogQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  username: z.string().trim().max(100).optional(),
  userType: z.enum(['ADMIN', 'APP']).optional(),
  success: z.enum(['true', 'false']).optional(),
  startTime: z.string().trim().max(30).optional(),
  endTime: z.string().trim().max(30).optional(),
});

export type OperationLogQuery = z.infer<typeof operationLogQuerySchema>;
export type LoginLogQuery = z.infer<typeof loginLogQuerySchema>;
