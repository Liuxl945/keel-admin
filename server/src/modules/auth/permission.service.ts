import { AppDataSource } from '../../db/data-source';
import { SysMenu, SysUser } from '../../db/entities';
import { buildMenuTree, type MenuNodeDto } from './menu-tree';

function userRepo() {
  return AppDataSource.getRepository(SysUser);
}

function menuRepo() {
  return AppDataSource.getRepository(SysMenu);
}

/** 单请求只查一次：roles + menus 一起带出，后续中间件复用 */
export function loadAdminUser(userId: number): Promise<SysUser | null> {
  return userRepo().findOne({
    where: { id: userId },
    relations: { roles: { menus: true } },
  });
}

function activeRoleMenus(user: SysUser): SysMenu[] {
  return user.roles
    .filter((role) => role.status === 'ENABLED')
    .flatMap((role) => role.menus);
}

function uniquePermissions(menus: SysMenu[]): string[] {
  return [
    ...new Set(
      menus
        .filter((menu) => menu.status === 'ENABLED' && menu.perm)
        .map((menu) => menu.perm as string),
    ),
  ].sort();
}

export async function collectPermissions(user: SysUser): Promise<string[]> {
  if (user.is_super_admin) {
    const menus = await menuRepo().find({ where: { status: 'ENABLED' } });
    return uniquePermissions(menus);
  }
  return uniquePermissions(activeRoleMenus(user));
}

export async function collectMenus(user: SysUser): Promise<MenuNodeDto[]> {
  if (user.is_super_admin) {
    const menus = await menuRepo().find({ where: { status: 'ENABLED' } });
    return buildMenuTree(menus);
  }
  return buildMenuTree(activeRoleMenus(user));
}
