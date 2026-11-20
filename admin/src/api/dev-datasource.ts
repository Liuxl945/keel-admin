import type { PageResult } from '@/types/api';
import type {
  DataSourceTable,
  DevDataSourceItem,
  DevDataSourceOption,
  DevDataSourceStatus,
  DevDataSourceType,
} from '@/types/dev-db';
import { http } from './request';

export interface DataSourceQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  dbType?: DevDataSourceType;
  status?: DevDataSourceStatus;
  [key: string]: unknown;
}

export interface DataSourcePayload {
  name: string;
  code?: string;
  dbType?: DevDataSourceType;
  host: string;
  port?: number;
  databaseName: string;
  username: string;
  password?: string;
  status?: DevDataSourceStatus;
  isDefault?: boolean;
  remark?: string | null;
}

export interface DataSourceTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  syncedTables?: number;
}

export function listDataSources(params: DataSourceQuery): Promise<PageResult<DevDataSourceItem>> {
  return http.get<PageResult<DevDataSourceItem>>('/admin/dev/data-sources', { params });
}

export function listDataSourceOptions(): Promise<DevDataSourceOption[]> {
  return http.get<DevDataSourceOption[]>('/admin/dev/data-sources/options');
}

export function getDataSource(id: number): Promise<DevDataSourceItem> {
  return http.get<DevDataSourceItem>(`/admin/dev/data-sources/${id}`);
}

export function createDataSource(payload: DataSourcePayload): Promise<DevDataSourceItem> {
  return http.post<DevDataSourceItem>('/admin/dev/data-sources', payload);
}

export function updateDataSource(
  id: number,
  payload: Partial<Omit<DataSourcePayload, 'code' | 'dbType'>>,
): Promise<DevDataSourceItem> {
  return http.put<DevDataSourceItem>(`/admin/dev/data-sources/${id}`, payload);
}

export function deleteDataSource(id: number): Promise<null> {
  return http.delete<null>(`/admin/dev/data-sources/${id}`);
}

export function testDataSource(id: number): Promise<DataSourceTestResult> {
  return http.post<DataSourceTestResult>(`/admin/dev/data-sources/${id}/test`);
}

export function listDataSourceTables(id: number): Promise<DataSourceTable[]> {
  return http.get<DataSourceTable[]>(`/admin/dev/data-sources/${id}/tables`);
}
