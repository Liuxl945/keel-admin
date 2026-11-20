import type { PageResult } from '@/types/api';
import type {
  CreateDevApiPayload,
  DevApiDetail,
  DevApiQuery,
  DevApiRunResult,
  DevApiSummary,
  RunDevApiPayload,
  UpdateDevApiPayload,
} from '@/types/dev-api';
import { http } from './request';

export function listDevApis(params: DevApiQuery): Promise<PageResult<DevApiSummary>> {
  return http.get<PageResult<DevApiSummary>>('/admin/dev/apis', { params });
}

export function getDevApi(id: number): Promise<DevApiDetail> {
  return http.get<DevApiDetail>(`/admin/dev/apis/${id}`);
}

export function createDevApi(payload: CreateDevApiPayload): Promise<DevApiDetail> {
  return http.post<DevApiDetail>('/admin/dev/apis', payload);
}

export function updateDevApi(id: number, payload: UpdateDevApiPayload): Promise<DevApiDetail> {
  return http.put<DevApiDetail>(`/admin/dev/apis/${id}`, payload);
}

export function deleteDevApi(id: number): Promise<null> {
  return http.delete<null>(`/admin/dev/apis/${id}`);
}

export function publishDevApi(id: number): Promise<DevApiDetail> {
  return http.post<DevApiDetail>(`/admin/dev/apis/${id}/publish`);
}

/** 在线调试：参数值由后端绑定，返回按字段映射后的结果 */
export function runDevApi(id: number, payload: RunDevApiPayload): Promise<DevApiRunResult> {
  return http.post<DevApiRunResult>(`/admin/dev/apis/${id}/run`, payload);
}
