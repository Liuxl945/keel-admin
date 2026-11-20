import type { SysRole, SysUser } from '../../db/entities';

export interface RoleBriefDto {
  id: number;
  name: string;
  code: string;
}

export interface UserProfileDto {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  isSuperAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: RoleBriefDto[];
}

export function toRoleBrief(role: SysRole): RoleBriefDto {
  return { id: role.id, name: role.name, code: role.code };
}

/**
 * 显式白名单输出，password_hash 等字段永远不会因为「顺手 return 实体」泄露。
 */
export function toUserProfile(user: SysUser): UserProfileDto {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    email: user.email,
    phone: user.phone,
    status: user.status,
    isSuperAdmin: user.is_super_admin,
    lastLoginAt: user.last_login_at,
    createdAt: user.createdAt,
    roles: (user.roles ?? []).map(toRoleBrief),
  };
}
