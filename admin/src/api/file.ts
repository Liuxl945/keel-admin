import type { PageResult } from '@/types/api';
import type { UploadedFileItem } from '@/types/entities';
import { http } from './request';

export interface FileQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export function listFiles(params: FileQuery): Promise<PageResult<UploadedFileItem>> {
  return http.get<PageResult<UploadedFileItem>>('/admin/files', { params });
}

export function deleteFile(id: number): Promise<null> {
  return http.delete<null>(`/admin/files/${id}`);
}
