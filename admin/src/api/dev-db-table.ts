import type { PageResult } from '@/types/api';
import type { SyncedTableDetail, SyncedTableSummary } from '@/types/dev-db';
import { http } from './request';

export interface SyncedTableQuery {
  page?: number;
  pageSize?: number;
  connectionId?: number;
  keyword?: string;
  [key: string]: unknown;
}

export function listSyncedTables(params: SyncedTableQuery): Promise<PageResult<SyncedTableSummary>> {
  return http.get<PageResult<SyncedTableSummary>>('/admin/dev/db-tables', { params });
}

export function getSyncedTable(id: number): Promise<SyncedTableDetail> {
  return http.get<SyncedTableDetail>(`/admin/dev/db-tables/${id}`);
}

export function syncTables(connectionId: number): Promise<{ count: number }> {
  return http.post<{ count: number }>(`/admin/dev/db-tables/sync/${connectionId}`);
}
