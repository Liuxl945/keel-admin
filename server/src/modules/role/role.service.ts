import { In } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { SysMenu, SysRole } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import type { CreateRoleInput, RoleQuery, UpdateRoleInput } from './role.dto';

/** 种子依赖这些 code，删除或改编码会让权限体系失去锚点 */
const PROTECTED_ROLE_CODES = new Set(['system_admin']);

function roleRepo() {
  return AppDataSource.getRepository(SysRole);
}

function menuRepo() {
  return AppDataSource.getRepository(SysMenu);
}

function toRoleDto(role: SysRole & { user_count?: number; menu_count?: number }) {
  return {
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    sort: role.sort,
    status: role.status,
    userCount: role.user_count ?? 0,
    menuCount: role.menu_count ?? 0,
    createdAt: role.createdAt,
  };
}

async function findRoleOrFail(id: number): Promise<SysRole> {
  const role = await roleRepo().findOneBy({ id });
  if (!role) throw new AppError(ERROR_CODES.NOT_FOUND, '角色不存在');
  return role;
}

export async function listRoles(query: RoleQuery) {
  const { page, pageSize, keyword, status } = query;
  const qb = roleRepo()
    .createQueryBuilder('role')
    .loadRelationCountAndMap('role.user_count', 'role.users')
    .loadRelationCountAndMap('role.menu_count', 'role.menus')
    .orderBy('role.sort', 'ASC')
    .addOrderBy('role.id', 'ASC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(role.name LIKE :keyword OR role.code LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (status) qb.andWhere('role.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  return {
    list: rows.map((role) => toRoleDto(role as SysRole & { user_count?: number; menu_count?: number })),
    total,
    page,
    pageSize,
  };
}

export async function listRoleOptions() {
  const roles = await roleRepo().find({
    where: { status: 'ENABLED' },
    order: { sort: 'ASC', id: 'ASC' },
  });
  return roles.map((role) => ({ id: role.id, name: role.name, code: role.code }));
}

export async function getRole(id: number) {
  const role = await roleRepo().findOne({
    where: { id },
    relations: { menus: true },
  });
  if (!role) throw new AppError(ERROR_CODES.NOT_FOUND, '角色不存在');
  return {
    ...toRoleDto(role as SysRole & { user_count?: number; menu_count?: number }),
    menuIds: role.menus.map((menu) => menu.id),
  };
}

export async function createRole(input: CreateRoleInput) {
  const exists = await roleRepo().findOne({ where: { code: input.code }, withDeleted: true });
  if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '角色编码已存在');

  const role = roleRepo().create({
    name: input.name,
    code: input.code,
    description: input.description ?? null,
    sort: input.sort,
    status: input.status,
    menus: [],
  });
  await roleRepo().save(role);
  return toRoleDto(role);
}

export async function updateRole(id: number, input: UpdateRoleInput) {
  const role = await findRoleOrFail(id);

  if (PROTECTED_ROLE_CODES.has(role.code) && input.status === 'DISABLED') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '内置角色不能禁用');
  }

  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description ?? null } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  // 空更新体会让 TypeORM 抛错，直接视为无改动
  if (Object.keys(patch).length > 0) await roleRepo().update(id, patch);

  return toRoleDto(await findRoleOrFail(id));
}

export async function deleteRole(id: number) {
  const role = await roleRepo().findOne({
    where: { id },
    relations: { users: true },
  });
  if (!role) throw new AppError(ERROR_CODES.NOT_FOUND, '角色不存在');
  if (PROTECTED_ROLE_CODES.has(role.code)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '内置角色不能删除');
  }
  if (role.users.length > 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该角色下仍有用户，请先解除关联');
  }

  role.menus = [];
  await roleRepo().save(role);
  await roleRepo().delete({ id });
}

export async function assignMenus(id: number, menuIds: number[]) {
  const role = await roleRepo().findOne({
    where: { id },
    relations: { menus: true },
  });
  if (!role) throw new AppError(ERROR_CODES.NOT_FOUND, '角色不存在');

  const uniqueIds = [...new Set(menuIds)];
  const menus = uniqueIds.length > 0 ? await menuRepo().findBy({ id: In(uniqueIds) }) : [];
  if (menus.length !== uniqueIds.length) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '部分菜单不存在');
  }

  role.menus = menus;
  await roleRepo().save(role);
  return getRole(id);
}
