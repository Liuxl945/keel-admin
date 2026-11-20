import type { AdminUser, LoginResult, MenuNode } from '@/types/entities';
import { http } from './request';

export interface LoginPayload {
  username: string;
  password: string;
  captchaId: string;
  captchaCode: string;
}

export interface CaptchaResult {
  captchaId: string;
  image: string;
  expiresIn: number;
}

export function login(payload: LoginPayload): Promise<LoginResult> {
  return http.post<LoginResult>('/auth/admin/login', payload, { _skipRefresh: true });
}

export function getCaptcha(): Promise<CaptchaResult> {
  return http.get<CaptchaResult>('/auth/captcha', { _skipAuth: true, _skipRefresh: true });
}

export function logout(): Promise<null> {
  return http.post<null>('/auth/admin/logout', undefined, { _skipRefresh: true });
}

export function getMe(): Promise<AdminUser> {
  return http.get<AdminUser>('/auth/admin/me');
}

export function getMyMenus(): Promise<MenuNode[]> {
  return http.get<MenuNode[]>('/auth/admin/me/menus');
}

export function getMyPermissions(): Promise<string[]> {
  return http.get<string[]>('/auth/admin/me/permissions');
}

export function getPublicConfigs(): Promise<Record<string, string>> {
  return http.get<Record<string, string>>('/configs', { _skipAuth: true, _skipRefresh: true });
}
