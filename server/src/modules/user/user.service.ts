import { In } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { SysRole, SysUser } from '../../db/entities';
import type { AuthContext } from '../../types/express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { formatDateTime } from '../../utils/datetime';
import { hashPassword } from '../../utils/password';
import { toUserProfile } from './user.mapper';
import type { CreateUserInput, UpdateUserInput, UserQuery } from './user.dto';

function userRepo() {
  return AppDataSource.getRepository(SysUser);
}

function roleRepo() {
  return AppDataSource.getRepository(SysRole);
}

async function loadRoles(roleIds: number[]): Promise<SysRole[]> {
  if (roleIds.length === 0) return [];
  const roles = await roleRepo().findBy({ id: In(roleIds) });
  if (roles.length !== new Set(roleIds).size) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '部分角色不存在');
  }
  return roles;
}

function assertCanManage(target: SysUser, operator: AuthContext): void {
  if (target.is_super_admin && !operator.isSuperAdmin) {
    throw new AppError(ERROR_CODES.FORBIDDEN, '无权操作超级管理员账号');
  }
}

async function findUserOrFail(id: number, withRoles = true): Promise<SysUser> {
  const user = await userRepo().findOne({
    where: { id },
    relations: withRoles ? { roles: true } : undefined,
  });
  if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, '用户不存在');
  return user;
}

export async function listUsers(query: UserQuery) {
  const { page, pageSize, keyword, status } = query;
  const qb = userRepo()
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.roles', 'role')
    .orderBy('user.createdAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(user.username LIKE :keyword OR user.nickname LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (status) qb.andWhere('user.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toUserProfile), total, page, pageSize };
}

export async function getUser(id: number) {
  return toUserProfile(await findUserOrFail(id));
}

export async function createUser(input: CreateUserInput, operator: AuthContext) {
  const exists = await userRepo().findOne({ where: { username: input.username }, withDeleted: true });
  if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '账号已存在');

  const roles = await loadRoles(input.roleIds);
  if (!operator.isSuperAdmin && roles.some((role) => role.code === 'system_admin')) {
    throw new AppError(ERROR_CODES.FORBIDDEN, '只有超级管理员可以分配系统管理员角色');
  }

  const user = userRepo().create({
    username: input.username,
    password_hash: await hashPassword(input.password),
    nickname: input.nickname,
    avatar: input.avatar ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    status: input.status,
    is_super_admin: false,
    last_login_at: null,
    roles,
  });
  await userRepo().save(user);
  return toUserProfile(await findUserOrFail(user.id));
}

export async function updateUser(id: number, input: UpdateUserInput, operator: AuthContext) {
  const user = await findUserOrFail(id);
  assertCanManage(user, operator);

  if (input.status === 'DISABLED' && id === operator.userId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '不能禁用当前登录账号');
  }

  const patch = {
    ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
    ...(input.avatar !== undefined ? { avatar: input.avatar ?? null } : {}),
    ...(input.email !== undefined ? { email: input.email ?? null } : {}),
    ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  // 空更新体会让 TypeORM 抛错，直接视为无改动
  if (Object.keys(patch).length > 0) await userRepo().update(id, patch);

  return toUserProfile(await findUserOrFail(id));
}

export async function deleteUser(id: number, operator: AuthContext) {
  const user = await findUserOrFail(id);
  assertCanManage(user, operator);

  if (id === operator.userId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '不能删除当前登录账号');
  }

  // 先解除关联再物理删除：账号名可以复用，操作日志仍保留历史记录
  user.roles = [];
  await userRepo().save(user);
  await userRepo().delete({ id });
}

export async function assignRoles(id: number, roleIds: number[], operator: AuthContext) {
  const user = await findUserOrFail(id);
  assertCanManage(user, operator);

  const roles = await loadRoles(roleIds);
  if (!operator.isSuperAdmin && roles.some((role) => role.code === 'system_admin')) {
    throw new AppError(ERROR_CODES.FORBIDDEN, '只有超级管理员可以分配系统管理员角色');
  }

  user.roles = roles;
  await userRepo().save(user);
  return toUserProfile(await findUserOrFail(id));
}

export async function resetPassword(id: number, password: string, operator: AuthContext) {
  const user = await findUserOrFail(id, false);
  assertCanManage(user, operator);
  await userRepo().update(id, { password_hash: await hashPassword(password) });
}

export async function updateStatus(id: number, status: 'ENABLED' | 'DISABLED', operator: AuthContext) {
  const user = await findUserOrFail(id, false);
  assertCanManage(user, operator);

  if (status === 'DISABLED' && id === operator.userId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '不能禁用当前登录账号');
  }
  await userRepo().update(id, { status });
  return toUserProfile(await findUserOrFail(id));
}

export async function listUsersForExport(query: UserQuery) {
  const qb = userRepo()
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.roles', 'role')
    .orderBy('user.createdAt', 'DESC')
    .take(5000);

  if (query.keyword) {
    qb.andWhere('(user.username LIKE :keyword OR user.nickname LIKE :keyword)', {
      keyword: `%${query.keyword}%`,
    });
  }
  if (query.status) qb.andWhere('user.status = :status', { status: query.status });

  const rows = await qb.getMany();
  return rows.map((user) => ({
    username: user.username,
    nickname: user.nickname,
    email: user.email ?? '',
    phone: user.phone ?? '',
    status: user.status === 'ENABLED' ? '启用' : '禁用',
    roles: (user.roles ?? []).map((role) => role.name).join('、'),
    createdAt: formatDateTime(user.createdAt),
  }));
}

export interface ImportUsersResult {
  total: number;
  success: number;
  skipped: number;
  errors: string[];
}

/** 导入采用「逐行处理、失败不中断」：与 RuoYi 的导入语义保持一致 */
export async function importUsers(
  rows: Array<Record<string, string>>,
  operator: AuthContext,
): Promise<ImportUsersResult> {
  const result: ImportUsersResult = { total: rows.length, success: 0, skipped: 0, errors: [] };
  if (rows.length > 1000) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '单次最多导入 1000 条用户');
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 2;
    const username = (row['账号'] ?? '').trim();
    const nickname = (row['昵称'] ?? '').trim();
    const password = (row['初始密码'] ?? '').trim();
    const email = (row['邮箱'] ?? '').trim();
    const phone = (row['手机号'] ?? '').trim();
    const statusText = (row['状态'] ?? '').trim();
    const status = statusText === '禁用' ? 'DISABLED' : 'ENABLED';

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      result.errors.push(`第 ${line} 行：账号格式不正确`);
      continue;
    }
    if (!nickname) {
      result.errors.push(`第 ${line} 行：昵称不能为空`);
      continue;
    }
    if (password.length < 8) {
      result.errors.push(`第 ${line} 行：初始密码至少 8 位`);
      continue;
    }

    const exists = await userRepo().findOne({ where: { username }, withDeleted: true });
    if (exists) {
      result.skipped += 1;
      continue;
    }

    try {
      await createUser(
        {
          username,
          password,
          nickname,
          email: email || null,
          phone: phone || null,
          status,
          roleIds: [],
        },
        operator,
      );
      result.success += 1;
    } catch (error) {
      const message = error instanceof AppError ? error.message : '创建失败';
      result.errors.push(`第 ${line} 行：${message}`);
    }
  }

  return result;
}
