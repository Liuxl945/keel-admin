import type { ConfigItem } from '@/types/entities';
import { http } from './request';

export function listConfigs(): Promise<ConfigItem[]> {
  return http.get<ConfigItem[]>('/admin/configs');
}

export function updateConfigs(items: Array<{ key: string; value: string }>): Promise<ConfigItem[]> {
  return http.put<ConfigItem[]>('/admin/configs', { items });
}
