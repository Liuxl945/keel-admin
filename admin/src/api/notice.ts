import type { PageResult } from '@/types/api';
import type { Notice, NoticeStatus, NoticeType } from '@/types/entities';
import { http } from './request';

export interface NoticeQuery {
  page?: number;
  pageSize?: number;
  title?: string;
  noticeType?: NoticeType;
  status?: NoticeStatus;
  [key: string]: unknown;
}

export interface NoticePayload {
  title: string;
  noticeType?: NoticeType;
  content: string;
  status?: NoticeStatus;
}

export function listNotices(params: NoticeQuery): Promise<PageResult<Notice>> {
  return http.get<PageResult<Notice>>('/admin/notices', { params });
}

export function getNotice(id: number): Promise<Notice> {
  return http.get<Notice>(`/admin/notices/${id}`);
}

export function createNotice(payload: NoticePayload): Promise<Notice> {
  return http.post<Notice>('/admin/notices', payload);
}

export function updateNotice(id: number, payload: Partial<NoticePayload>): Promise<Notice> {
  return http.put<Notice>(`/admin/notices/${id}`, payload);
}

export function updateNoticeStatus(id: number, status: NoticeStatus): Promise<Notice> {
  return http.put<Notice>(`/admin/notices/${id}/status`, { status });
}

export function deleteNotice(id: number): Promise<null> {
  return http.delete<null>(`/admin/notices/${id}`);
}
