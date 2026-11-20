import type { PageResult } from '@/types/api';
import { http } from './request';

export interface PreviewRecord extends Record<string, unknown> {
  id: number;
}

export function listPreviewRecords(
  formId: number,
  params: Record<string, unknown>,
): Promise<PageResult<PreviewRecord>> {
  return http.get<PageResult<PreviewRecord>>(`/admin/dev/forms/${formId}/preview`, { params });
}

export function createPreviewRecord(
  formId: number,
  payload: Record<string, unknown>,
): Promise<PreviewRecord> {
  return http.post<PreviewRecord>(`/admin/dev/forms/${formId}/preview`, payload);
}

export function updatePreviewRecord(
  formId: number,
  rowId: number,
  payload: Record<string, unknown>,
): Promise<PreviewRecord> {
  return http.put<PreviewRecord>(`/admin/dev/forms/${formId}/preview/${rowId}`, payload);
}

export function deletePreviewRecord(formId: number, rowId: number): Promise<null> {
  return http.delete<null>(`/admin/dev/forms/${formId}/preview/${rowId}`);
}

/** 按子表设计读取一条主记录的全部明细，键为从表表名 */
export function getPreviewRecordDetails(
  formId: number,
  rowId: number,
): Promise<{ details: Record<string, PreviewRecord[]> }> {
  return http.get<{ details: Record<string, PreviewRecord[]> }>(
    `/admin/dev/forms/${formId}/preview/${rowId}/details`,
  );
}
