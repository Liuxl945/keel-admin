import type { AccountStatus, MenuNode, MenuType } from '@/types/entities';
import { http } from './request';

export interface MenuPayload {
  parentId?: number | null;
  name: string;
  type: MenuType;
  path?: string | null;
  component?: string | null;
  perm?: string | null;
  icon?: string | null;
  sort?: number;
  visible?: boolean;
  status?: AccountStatus;
  /** type=FORM 时必填，指向已发布的在线表单 */
  formId?: number | null;
}

export function listMenus(): Promise<MenuNode[]> {
  return http.get<MenuNode[]>('/admin/menus');
}

export function getMenu(id: number): Promise<MenuNode> {
  return http.get<MenuNode>(`/admin/menus/${id}`);
}

export function createMenu(payload: MenuPayload): Promise<MenuNode> {
  return http.post<MenuNode>('/admin/menus', payload);
}

export function updateMenu(id: number, payload: Partial<MenuPayload>): Promise<MenuNode> {
  return http.put<MenuNode>(`/admin/menus/${id}`, payload);
}

export function deleteMenu(id: number): Promise<null> {
  return http.delete<null>(`/admin/menus/${id}`);
}
