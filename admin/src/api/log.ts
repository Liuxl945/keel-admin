import type { PageResult } from '@/types/api';
import type { LoginLogItem, OperationLogDetail, OperationLogItem } from '@/types/entities';
import { downloadFile, http } from './request';

export interface OperationLogQuery {
  page?: number;
  pageSize?: number;
  username?: string;
  path?: string;
  method?: string;
  startTime?: string;
  endTime?: string;
  [key: string]: unknown;
}

export interface LoginLogQuery {
  page?: number;
  pageSize?: number;
  username?: string;
  userType?: string;
  success?: string;
  startTime?: string;
  endTime?: string;
  [key: string]: unknown;
}

export function listOperationLogs(params: OperationLogQuery): Promise<PageResult<OperationLogItem>> {
  return http.get<PageResult<OperationLogItem>>('/admin/logs/operation-logs', { params });
}

export function getOperationLog(id: number): Promise<OperationLogDetail> {
  return http.get<OperationLogDetail>(`/admin/logs/operation-logs/${id}`);
}

export function batchDeleteOperationLogs(ids: number[]): Promise<{ count: number }> {
  return http.post<{ count: number }>('/admin/logs/operation-logs/batch-delete', { ids });
}

export function listLoginLogs(params: LoginLogQuery): Promise<PageResult<LoginLogItem>> {
  return http.get<PageResult<LoginLogItem>>('/admin/logs/login-logs', { params });
}

export function batchDeleteLoginLogs(ids: number[]): Promise<{ count: number }> {
  return http.post<{ count: number }>('/admin/logs/login-logs/batch-delete', { ids });
}

export function exportOperationLogs(params: OperationLogQuery): Promise<void> {
  return downloadFile('/admin/logs/operation-logs/export', params, '操作日志.xlsx');
}

export function exportLoginLogs(params: LoginLogQuery): Promise<void> {
  return downloadFile('/admin/logs/login-logs/export', params, '登录日志.xlsx');
}
