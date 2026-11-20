import type { ServerInfo } from '@/types/entities';
import { http } from './request';

export function getServerInfo(): Promise<ServerInfo> {
  return http.get<ServerInfo>('/admin/monitor/server');
}
