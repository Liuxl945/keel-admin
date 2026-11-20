import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from '../../utils/pagination';

const noticeTypeSchema = z.enum(['NOTICE', 'ANNOUNCEMENT']);
const noticeStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']);

export const noticeQuerySchema = z.object({
  page: pageQuerySchema,
  pageSize: pageSizeQuerySchema,
  title: z.string().trim().max(200).optional(),
  noticeType: noticeTypeSchema.optional(),
  status: noticeStatusSchema.optional(),
});

export const createNoticeSchema = z.object({
  title: z.string().trim().min(1, '请输入公告标题').max(200, '标题不能超过 200'),
  noticeType: noticeTypeSchema.default('NOTICE'),
  content: z.string().min(1, '请输入公告内容').max(20000, '内容不能超过 20000'),
  status: noticeStatusSchema.default('DRAFT'),
});

export const updateNoticeSchema = z.object({
  title: z.string().trim().min(1, '请输入公告标题').max(200, '标题不能超过 200').optional(),
  noticeType: noticeTypeSchema.optional(),
  content: z.string().min(1, '请输入公告内容').max(20000, '内容不能超过 20000').optional(),
  status: noticeStatusSchema.optional(),
});

export const updateNoticeStatusSchema = z.object({
  status: noticeStatusSchema,
});

export type NoticeQuery = z.infer<typeof noticeQuerySchema>;
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>;
