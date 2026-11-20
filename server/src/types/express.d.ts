import type { Member, SysUser } from '../db/entities';

export interface AuthContext {
  userId: number;
  username: string;
  isSuperAdmin: boolean;
  audience: 'admin' | 'app';
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      authUser?: SysUser;
      appMember?: Member;
      /** 单请求内缓存的权限标识，避免每个中间件重复查库 */
      permissions?: string[];
    }
  }
}

export {};
