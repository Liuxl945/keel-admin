import type { AppLoginResult, AppMember } from '@/types/entities';
import { request } from './request';

export function appLogin(code: string): Promise<AppLoginResult> {
  return request<AppLoginResult>('/auth/app/login', {
    method: 'POST',
    data: { code },
    auth: false,
    _skipRefresh: true,
  });
}

export function getAppMe(): Promise<AppMember> {
  return request<AppMember>('/auth/app/me');
}

export function getPublicConfigs(): Promise<Record<string, string>> {
  return request<Record<string, string>>('/configs', { auth: false, _skipRefresh: true });
}
