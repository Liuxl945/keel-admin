import type { PageResult } from '@/types/api';
import type { AccountStatus, AdminUser } from '@/types/entities';
import { downloadFile, http, type RequestConfig } from './request';

export interface UserQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: AccountStatus;
  [key: string]: unknown;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  nickname: string;
  avatar?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: AccountStatus;
  roleIds?: number[];
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'username' | 'password' | 'roleIds'>>;

export function listUsers(params: UserQuery, config?: RequestConfig): Promise<PageResult<AdminUser>> {
  return http.get<PageResult<AdminUser>>('/admin/users', { ...config, params });
}

export function getUser(id: number): Promise<AdminUser> {
  return http.get<AdminUser>(`/admin/users/${id}`);
}

export function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  return http.post<AdminUser>('/admin/users', payload);
}

export function updateUser(id: number, payload: UpdateUserPayload): Promise<AdminUser> {
  return http.put<AdminUser>(`/admin/users/${id}`, payload);
}

export function deleteUser(id: number): Promise<null> {
  return http.delete<null>(`/admin/users/${id}`);
}

export function assignUserRoles(id: number, roleIds: number[]): Promise<AdminUser> {
  return http.put<AdminUser>(`/admin/users/${id}/roles`, { roleIds });
}

export function resetUserPassword(id: number, password: string): Promise<null> {
  return http.put<null>(`/admin/users/${id}/password`, { password });
}

export function updateUserStatus(id: number, status: AccountStatus): Promise<AdminUser> {
  return http.put<AdminUser>(`/admin/users/${id}/status`, { status });
}

export interface ImportUsersResult {
  total: number;
  success: number;
  skipped: number;
  errors: string[];
}

export function exportUsers(params: UserQuery): Promise<void> {
  return downloadFile('/admin/users/export', params, '用户数据.xlsx');
}

export function downloadUserImportTemplate(): Promise<void> {
  return downloadFile('/admin/users/import-template', {}, '用户导入模板.xlsx');
}

export function importUsers(file: File): Promise<ImportUsersResult> {
  const formData = new FormData();
  formData.append('file', file);
  return http.post<ImportUsersResult>('/admin/users/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
