import { IsNull } from 'typeorm';
import { config } from '../config';
import { hashPassword } from '../utils/password';
import { logger } from '../utils/logger';
import { AppDataSource } from './data-source';
import { SysDictData, SysDictType, SysMenu, SysRole, SysUser } from './entities';
import { ensureConfigRows } from '../modules/config/config.service';
import { DICT_SEED, MENU_SEED, ROLE_SEED, isDemoMenu, isViewerMenu, type MenuSeedNode } from './seed-data';
import { seedDemoData } from './demo-seed';

interface UpsertedMenu {
  id: number;
  type: SysMenu['type'];
  perm: string | null;
}

function menuRepo() {
  return AppDataSource.getRepository(SysMenu);
}

function roleRepo() {
  return AppDataSource.getRepository(SysRole);
}

function userRepo() {
  return AppDataSource.getRepository(SysUser);
}

/**
 * 按 perm / path / 父级+名称 三种锚点查找，保证重复执行不会插重复行。
 * 不覆盖已存在的密码与角色分配。
 */
async function upsertMenu(node: MenuSeedNode, parentId: number | null): Promise<UpsertedMenu> {
  const repo = menuRepo();
  let existing: SysMenu | null = null;

  if (node.perm) {
    existing = await repo.findOne({ where: { perm: node.perm }, withDeleted: true });
  } else if (node.path) {
    existing = await repo.findOne({ where: { path: node.path }, withDeleted: true });
  } else {
    existing = await repo.findOne({
      where: { parent_id: parentId ?? IsNull(), name: node.name },
      withDeleted: true,
    });
  }

  const values = {
    parent_id: parentId,
    name: node.name,
    type: node.type,
    path: node.path ?? null,
    component: node.component ?? null,
    perm: node.perm ?? null,
    icon: node.icon ?? null,
    sort: node.sort ?? 0,
    visible: node.visible ?? true,
    status: node.status ?? ('ENABLED' as const),
  };

  if (existing) {
    await repo.update(existing.id, values);
    if (existing.deletedAt) await repo.restore(existing.id);
    return { id: existing.id, type: node.type, perm: node.perm ?? null };
  }

  const created = await repo.save(repo.create(values));
  return { id: created.id, type: node.type, perm: node.perm ?? null };
}

async function upsertMenuTree(nodes: MenuSeedNode[], parentId: number | null, output: UpsertedMenu[]): Promise<void> {
  for (const node of nodes) {
    const saved = await upsertMenu(node, parentId);
    output.push(saved);
    if (node.children?.length) {
      await upsertMenuTree(node.children, saved.id, output);
    }
  }
}

async function upsertRoles(menus: UpsertedMenu[]): Promise<Map<string, SysRole>> {
  const repo = roleRepo();
  const result = new Map<string, SysRole>();

  for (const seed of ROLE_SEED) {
    let role = await repo.findOne({ where: { code: seed.code }, withDeleted: true });
    if (!role) {
      role = await repo.save(
        repo.create({
          name: seed.name,
          code: seed.code,
          description: seed.description,
          sort: seed.sort,
          status: 'ENABLED',
          menus: [],
        }),
      );
    } else if (role.deletedAt) {
      await repo.restore(role.id);
    }

    const menuIds =
      seed.code === 'system_admin'
        ? menus.map((menu) => menu.id)
        : menus.filter((menu) => isViewerMenu(menu.type, menu.perm)).map((menu) => menu.id);

    const roleMenus = menuIds.length > 0 ? await menuRepo().findBy(menuIds.map((id) => ({ id }))) : [];
    role.menus = roleMenus;
    await repo.save(role);
    result.set(seed.code, role);
  }

  return result;
}

async function ensureAdminUser(roles: Map<string, SysRole>): Promise<void> {
  const repo = userRepo();
  const existing = await repo.findOne({ where: { username: 'admin' }, withDeleted: true });
  if (existing) return;

  const adminRole = roles.get('system_admin');
  const admin = repo.create({
    username: 'admin',
    password_hash: await hashPassword(config.SEED_ADMIN_PASSWORD),
    nickname: '超级管理员',
    avatar: null,
    email: null,
    phone: null,
    status: 'ENABLED',
    is_super_admin: true,
    last_login_at: null,
    roles: adminRole ? [adminRole] : [],
  });
  await repo.save(admin);
  logger.info('已创建默认超管账号 admin');
}

const DEMO_USERNAME = 'demo';
const DEMO_ROLE_CODE = 'demo';

/**
 * 演示账户：在线开发的增删改查全部放开，只收回「改用户/角色/菜单/系统配置」这类会把系统搞坏的高危权限。
 * 角色菜单每次启动按「全部菜单 - 高危权限」重算，保证表单设计里新生成的菜单演示账号也能直接访问；
 * 已存在的演示用户不重置密码，避免覆盖后续手工调整。
 */
async function ensureDemoAccount(): Promise<void> {
  const grantedMenus = (await menuRepo().find()).filter((menu) => isDemoMenu(menu.type, menu.perm));
  let role = await roleRepo().findOne({
    where: { code: DEMO_ROLE_CODE },
    withDeleted: true,
    relations: { menus: true },
  });
  if (!role) {
    role = await roleRepo().save(
      roleRepo().create({
        name: '演示账户',
        code: DEMO_ROLE_CODE,
        description: '在线开发演示用：除用户/角色/菜单/系统配置外均可操作',
        sort: 3,
        status: 'ENABLED',
        menus: grantedMenus,
      }),
    );
    logger.info('已创建演示角色 demo');
  } else {
    if (role.deletedAt) {
      await roleRepo().restore(role.id);
      role = (await roleRepo().findOne({
        where: { code: DEMO_ROLE_CODE },
        relations: { menus: true },
      }))!;
    }
    const current = new Set(role.menus.map((menu) => menu.id));
    const changed =
      current.size !== grantedMenus.length || grantedMenus.some((menu) => !current.has(menu.id));
    if (changed) {
      role.menus = grantedMenus;
      await roleRepo().save(role);
      logger.info('演示角色 demo 已同步最新菜单');
    }
  }

  const existing = await userRepo().findOne({ where: { username: DEMO_USERNAME }, withDeleted: true });
  if (existing) {
    if (existing.deletedAt) await userRepo().restore(existing.id);
    return;
  }
  await userRepo().save(
    userRepo().create({
      username: DEMO_USERNAME,
      password_hash: await hashPassword(config.SEED_DEMO_PASSWORD),
      nickname: '演示账户',
      avatar: null,
      email: null,
      phone: null,
      status: 'ENABLED',
      is_super_admin: false,
      last_login_at: null,
      roles: [role],
    }),
  );
  logger.info('已创建演示账号 demo');
}

/** 内置字典幂等补齐，不覆盖用户后续修改的标签或排序 */
async function seedDicts(): Promise<void> {
  const typeRepo = AppDataSource.getRepository(SysDictType);
  const dataRepo = AppDataSource.getRepository(SysDictData);

  for (const seedType of DICT_SEED) {
    let type = await typeRepo.findOne({
      where: { dict_type: seedType.dictType },
      withDeleted: true,
    });

    if (!type) {
      type = await typeRepo.save(
        typeRepo.create({
          dict_name: seedType.dictName,
          dict_type: seedType.dictType,
          status: 'ENABLED',
          remark: seedType.remark,
        }),
      );
    } else if (type.deletedAt) {
      await typeRepo.restore(type.id);
    }

    for (const item of seedType.data) {
      const exists = await dataRepo.findOne({
        where: { dict_type: seedType.dictType, dict_value: item.value },
        withDeleted: true,
      });
      if (exists) {
        if (exists.deletedAt) await dataRepo.restore(exists.id);
        continue;
      }
      await dataRepo.save(
        dataRepo.create({
          dict_type: seedType.dictType,
          dict_label: item.label,
          dict_value: item.value,
          dict_sort: item.sort,
          tag_type: item.tagType,
          status: 'ENABLED',
          remark: null,
        }),
      );
    }
  }
}

export async function seed(): Promise<void> {
  const menus: UpsertedMenu[] = [];
  await upsertMenuTree(MENU_SEED, null, menus);
  const roles = await upsertRoles(menus);
  await ensureAdminUser(roles);
  await ensureDemoAccount();
  await ensureConfigRows();
  await seedDicts();
  await seedDemoDataSafely();
  logger.info({ menuCount: menus.length, roleCount: roles.size }, '种子数据已就绪');
}

/** 演示数据失败不能影响启动，只记录告警 */
async function seedDemoDataSafely(): Promise<void> {
  try {
    await seedDemoData();
  } catch (error) {
    logger.warn({ err: error }, '在线开发演示数据写入失败，已跳过');
  }
}

/** 启动时只在空库场景执行完整 seed，避免覆盖用户对菜单的后续调整 */
export async function runSeedIfNeeded(): Promise<void> {
  const userCount = await userRepo().count();
  if (userCount === 0) {
    await seed();
    return;
  }
  await ensureDemoAccount();
  await ensureConfigRows();
  await seedDicts();
  await seedDemoDataSafely();
}
