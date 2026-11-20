import type { PageResult } from '@/types/api';
import type {
  DevModelDdlResult,
  DevModelDetail,
  DevModelField,
  DevModelStatus,
  DevModelSummary,
  DevDataSourceType,
} from '@/types/dev-db';
import { http } from './request';

export interface DevModelQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: DevModelStatus;
  connectionId?: number;
  [key: string]: unknown;
}

export interface CreateDevModelPayload {
  name: string;
  modelKey: string;
  connectionId: number;
  tableName: string;
  tableComment?: string | null;
  fields?: DevModelField[];
}

export interface UpdateDevModelPayload {
  name?: string;
  connectionId?: number;
  tableName?: string;
  tableComment?: string | null;
  fields?: DevModelField[];
}

export interface ImportExistingModelPayload {
  name: string;
  modelKey: string;
  connectionId: number;
  tableName: string;
}

export function listDevModels(params: DevModelQuery): Promise<PageResult<DevModelSummary>> {
  return http.get<PageResult<DevModelSummary>>('/admin/dev/models', { params });
}

export function getDevModel(id: number): Promise<DevModelDetail> {
  return http.get<DevModelDetail>(`/admin/dev/models/${id}`);
}

export function createDevModel(payload: CreateDevModelPayload): Promise<DevModelDetail> {
  return http.post<DevModelDetail>('/admin/dev/models', payload);
}

export function importExistingModel(payload: ImportExistingModelPayload): Promise<DevModelDetail> {
  return http.post<DevModelDetail>('/admin/dev/models/import-existing', payload);
}

export function updateDevModel(id: number, payload: UpdateDevModelPayload): Promise<DevModelDetail> {
  return http.put<DevModelDetail>(`/admin/dev/models/${id}`, payload);
}

export function deleteDevModel(id: number): Promise<null> {
  return http.delete<null>(`/admin/dev/models/${id}`);
}

export function previewDevModelDdl(id: number): Promise<DevModelDdlResult> {
  return http.get<DevModelDdlResult>(`/admin/dev/models/${id}/ddl`);
}

export function publishDevModel(id: number): Promise<DevModelDetail> {
  return http.post<DevModelDetail>(`/admin/dev/models/${id}/publish`);
}

/** @deprecated 使用 publishDevModel，旧接口保留兼容 */
export function createDevModelTable(id: number): Promise<DevModelDetail> {
  return http.post<DevModelDetail>(`/admin/dev/models/${id}/create-table`);
}

export type { DevDataSourceType };
