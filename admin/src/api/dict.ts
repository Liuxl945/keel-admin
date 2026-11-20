import type { PageResult } from '@/types/api';
import type {
  AccountStatus,
  DictData,
  DictTagType,
  DictType,
  DictTypeOption,
} from '@/types/entities';
import { http } from './request';

export interface DictTypeQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: AccountStatus;
  [key: string]: unknown;
}

export interface DictTypePayload {
  dictName: string;
  dictType?: string;
  status?: AccountStatus;
  remark?: string | null;
}

export interface DictDataQuery {
  page?: number;
  pageSize?: number;
  dictType?: string;
  label?: string;
  status?: AccountStatus;
  [key: string]: unknown;
}

export interface DictDataPayload {
  dictType?: string;
  dictLabel: string;
  dictValue: string;
  dictSort?: number;
  tagType?: DictTagType;
  status?: AccountStatus;
  remark?: string | null;
}

export function listDictTypes(params: DictTypeQuery): Promise<PageResult<DictType>> {
  return http.get<PageResult<DictType>>('/admin/dicts/types', { params });
}

export function listDictTypeOptions(): Promise<DictTypeOption[]> {
  return http.get<DictTypeOption[]>('/admin/dicts/types/options');
}

export function createDictType(payload: DictTypePayload): Promise<DictType> {
  return http.post<DictType>('/admin/dicts/types', payload);
}

export function updateDictType(id: number, payload: Omit<DictTypePayload, 'dictType'>): Promise<DictType> {
  return http.put<DictType>(`/admin/dicts/types/${id}`, payload);
}

export function deleteDictType(id: number): Promise<null> {
  return http.delete<null>(`/admin/dicts/types/${id}`);
}

export function listDictData(params: DictDataQuery): Promise<PageResult<DictData>> {
  return http.get<PageResult<DictData>>('/admin/dicts/data', { params });
}

export function getDictOptions(): Promise<Record<string, DictData[]>> {
  return http.get<Record<string, DictData[]>>('/admin/dicts/options');
}

export function createDictData(payload: DictDataPayload): Promise<DictData> {
  return http.post<DictData>('/admin/dicts/data', payload);
}

export function updateDictData(id: number, payload: Omit<DictDataPayload, 'dictType'>): Promise<DictData> {
  return http.put<DictData>(`/admin/dicts/data/${id}`, payload);
}

export function deleteDictData(id: number): Promise<null> {
  return http.delete<null>(`/admin/dicts/data/${id}`);
}
