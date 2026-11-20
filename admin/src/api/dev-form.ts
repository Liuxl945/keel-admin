import type { PageResult } from '@/types/api';
import type {
  DevFormCodeResult,
  DevFormDetail,
  DevFormSchema,
  DevFormStatus,
  DevFormSummary,
} from '@/types/dev';
import { downloadFile, http } from './request';

export interface DevFormQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: DevFormStatus;
  [key: string]: unknown;
}

export interface CreateDevFormPayload {
  name: string;
  formKey: string;
  description?: string | null;
  connectionId?: number | null;
  tableName?: string | null;
  schema?: DevFormSchema;
}

export interface UpdateDevFormPayload {
  name?: string;
  description?: string | null;
  connectionId?: number | null;
  tableName?: string | null;
  schema?: DevFormSchema;
}

export function listDevForms(params: DevFormQuery): Promise<PageResult<DevFormSummary>> {
  return http.get<PageResult<DevFormSummary>>('/admin/dev/forms', { params });
}

export function getDevForm(id: number): Promise<DevFormDetail> {
  return http.get<DevFormDetail>(`/admin/dev/forms/${id}`);
}

export function createDevForm(payload: CreateDevFormPayload): Promise<DevFormDetail> {
  return http.post<DevFormDetail>('/admin/dev/forms', payload);
}

export function updateDevForm(id: number, payload: UpdateDevFormPayload): Promise<DevFormDetail> {
  return http.put<DevFormDetail>(`/admin/dev/forms/${id}`, payload);
}

export function publishDevForm(id: number): Promise<DevFormDetail> {
  return http.post<DevFormDetail>(`/admin/dev/forms/${id}/publish`);
}

export function deleteDevForm(id: number): Promise<null> {
  return http.delete<null>(`/admin/dev/forms/${id}`);
}

export function getDevFormCode(id: number): Promise<DevFormCodeResult> {
  return http.get<DevFormCodeResult>(`/admin/dev/forms/${id}/code`);
}

/** 下载代码压缩包：包内已按 server/src/biz 与 admin/src/views/biz 分好目录 */
export function downloadDevFormCode(id: number): Promise<void> {
  return downloadFile(`/admin/dev/forms/${id}/code/zip`, {}, 'code.zip');
}

/** 生成页菜单 + 按钮权限，幂等；下载代码前调用一次保证菜单与代码配套 */
export function ensureDevFormMenu(
  id: number,
  parentId: number | null,
): Promise<GeneratedFormMenu & { created: boolean; hint?: string }> {
  return http.post(`/admin/dev/forms/${id}/menu/ensure`, { parentId });
}

export interface GeneratedFormMenu {
  menuId: number;
  name: string;
  path: string;
  component: string;
  perm: string;
  parentId: number | null;
  formId: number;
  formKey: string;
  buttons: Array<{ id: number; name: string; perm: string }>;
}

/** 生成业务菜单：页面菜单 + 查询/新增/编辑/删除权限点 */
export function generateDevFormMenu(
  id: number,
  parentId: number | null,
): Promise<GeneratedFormMenu> {
  return http.post<GeneratedFormMenu>(`/admin/dev/forms/${id}/menu`, { parentId });
}
