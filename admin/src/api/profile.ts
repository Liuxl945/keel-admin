import type { AdminUser } from '@/types/entities';
import { http } from './request';

export interface ProfilePayload {
  nickname?: string;
  avatar?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export function getProfile(): Promise<AdminUser> {
  return http.get<AdminUser>('/admin/profile');
}

export function updateProfile(payload: ProfilePayload): Promise<AdminUser> {
  return http.put<AdminUser>('/admin/profile', payload);
}

export function changePassword(payload: ChangePasswordPayload): Promise<null> {
  return http.put<null>('/admin/profile/password', payload);
}
