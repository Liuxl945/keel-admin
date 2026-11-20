import type { PageResult } from '@/types/api';
import type { AccountStatus, Role, RoleDetail, RoleOption } from '@/types/entities';
import { http } from './request';

export interface RoleQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: AccountStatus;
  [key: string]: unknown;
}

export interface CreateRolePayload {
  name: string;
  code: string;
  description?: string | null;
  sort?: number;
  status?: AccountStatus;
}

export type UpdateRolePayload = Partial<Omit<CreateRolePayload, 'code'>>;

export function listRoles(params: RoleQuery): Promise<PageResult<Role>> {
  return http.get<PageResult<Role>>('/admin/roles', { params });
}

export function listRoleOptions(): Promise<RoleOption[]> {
  return http.get<RoleOption[]>('/admin/roles/options');
}

export function getRole(id: number): Promise<RoleDetail> {
  return http.get<RoleDetail>(`/admin/roles/${id}`);
}

export function createRole(payload: CreateRolePayload): Promise<Role> {
  return http.post<Role>('/admin/roles', payload);
}

export function updateRole(id: number, payload: UpdateRolePayload): Promise<Role> {
  return http.put<Role>(`/admin/roles/${id}`, payload);
}

export function deleteRole(id: number): Promise<null> {
  return http.delete<null>(`/admin/roles/${id}`);
}

export function assignRoleMenus(id: number, menuIds: number[]): Promise<RoleDetail> {
  return http.put<RoleDetail>(`/admin/roles/${id}/menus`, { menuIds });
}
