import { In, IsNull, type EntityManager } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { DevForm, SysMenu, SysRole, type SysMenuType } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { FORM_MENU_BUTTONS, formMenuPerm } from './menu.constants';
import type { CreateMenuInput, UpdateMenuInput } from './menu.dto';

/** type=FORM 的菜单统一指向运行时通用页面，由 form_id 决定渲染哪张表单 */
const FORM_MENU_COMPONENT = 'biz/runtime/index';

/** 自动授权的默认角色：系统管理员，以及演示账户（演示时需要能打开新生成的菜单） */
const AUTO_GRANT_ROLE_CODES = ['system_admin', 'demo'];

/**
 * 菜单建好后默认授权给「系统管理员」与「演示账户」角色。
 *
 * 只建菜单不分配角色的话，除超管（is_super_admin）以外的账号在侧边栏看不到，
 * 还得回菜单管理手动勾一遍；这里补上，幂等，目标库没这些角色时直接跳过。
 */
async function grantMenuToDefaultRoles(
  manager: EntityManager,
  menuIds: number[],
): Promise<void> {
  const ids = Array.from(new Set(menuIds.filter((id) => Number.isFinite(id))));
  if (ids.length === 0) return;

  const roleRepo = manager.getRepository(SysRole);
  const roles = await roleRepo.find({
    where: { code: In(AUTO_GRANT_ROLE_CODES) },
    relations: { menus: true },
  });
  for (const role of roles) {
    const owned = new Set(role.menus.map((menu) => menu.id));
    const added = ids.filter((id) => !owned.has(id));
    if (added.length === 0) continue;
    role.menus = [...role.menus, ...added.map((id) => ({ id }) as SysMenu)];
    await roleRepo.save(role);
  }
}

interface MenuDto {
  id: number;
  parentId: number | null;
  name: string;
  type: string;
  path: string | null;
  component: string | null;
  perm: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  status: string;
  formId: number | null;
  /** 列表展示用，来自 dev_forms */
  formName: string | null;
  createdAt: Date;
  children: MenuDto[];
}

function menuRepo() {
  return AppDataSource.getRepository(SysMenu);
}

function formRepo() {
  return AppDataSource.getRepository(DevForm);
}

function toDto(menu: SysMenu): MenuDto {
  return {
    id: menu.id,
    parentId: menu.parent_id,
    name: menu.name,
    type: menu.type,
    path: menu.path,
    component: menu.component,
    perm: menu.perm,
    icon: menu.icon,
    sort: menu.sort,
    visible: menu.visible,
    status: menu.status,
    formId: menu.form_id ?? null,
    formName: null,
    createdAt: menu.createdAt,
    children: [],
  };
}

/**
 * 管理页需要看到禁用项和按钮，不能复用侧边栏的 buildMenuTree（它会过滤）。
 */
function buildTree(menus: SysMenu[]): MenuDto[] {
  const sorted = menus.slice().sort((a, b) => (a.sort !== b.sort ? a.sort - b.sort : a.id - b.id));
  const map = new Map<number, MenuDto>();
  for (const menu of sorted) map.set(menu.id, toDto(menu));

  const roots: MenuDto[] = [];
  for (const menu of sorted) {
    const node = map.get(menu.id)!;
    const parent = menu.parent_id ? map.get(menu.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function validateShape(
  type: SysMenuType,
  path: string | null | undefined,
  component: string | null | undefined,
  perm: string | null | undefined,
): void {
  if (type === 'MENU' || type === 'FORM') {
    if (!path || !component) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '页面菜单必须填写路由路径和组件路径');
    }
  }
  if (type === 'BUTTON' && !perm) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '按钮菜单必须填写权限标识');
  }
  if (type === 'BUTTON' && (path || component)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '按钮菜单不需要路由路径和组件路径');
  }
}

interface FormMenuBinding {
  formId: number;
  name: string;
  formKey: string;
  path: string;
  component: string;
}

/**
 * 表单菜单的 path/component 由绑定的表单推导，不允许手填，
 * 避免出现"菜单指向一个不存在的组件"这种不可用配置。
 */
async function resolveFormMenu(formId: number | null | undefined): Promise<FormMenuBinding> {
  if (!formId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请选择要绑定的在线表单');
  }
  const form = await formRepo().findOneBy({ id: formId });
  if (!form) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '所选表单不存在');
  if (form.status !== 'PUBLISHED') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '只能绑定已发布的表单，请先在设计器发布');
  }
  if (!form.connection_id || !form.table_name) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该表单未关联数据表，无法生成业务页面');
  }
  return {
    formId: form.id,
    name: form.name,
    formKey: form.form_key,
    path: `/biz/${form.form_key}`,
    component: FORM_MENU_COMPONENT,
  };
}


/**
 * 表单菜单的权限必须落在 biz_<form_key>:* 命名空间，
 * 否则运行时接口认不出来，会出现「菜单能点、数据全 403」。
 */
function assertFormPermNamespace(formKey: string, perm: string | null | undefined): void {
  if (!perm) return;
  const prefix = `biz_${formKey}:`;
  if (!perm.startsWith(prefix)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `表单菜单的权限标识需以 ${prefix} 开头`,
    );
  }
}

/** 同一张表单只能挂一个菜单，否则会生成重复路由 */
async function assertFormNotBound(formId: number, currentId?: number): Promise<void> {
  const exists = await menuRepo().findOne({
    where: { form_id: formId, type: 'FORM' },
    withDeleted: true,
  });
  if (exists && exists.id !== currentId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该表单已经绑定了菜单，请勿重复创建');
  }
}

async function assertParentValid(parentId: number | null | undefined, currentId?: number): Promise<void> {
  if (!parentId) return;

  if (currentId && parentId === currentId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '父级菜单不能是自己');
  }

  const parent = await menuRepo().findOneBy({ id: parentId });
  if (!parent) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '父级菜单不存在');
  if (parent.type === 'BUTTON') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '按钮不能作为父级菜单');
  }

  // 防止把菜单挂到自己的子孙下面形成环
  if (currentId) {
    let cursor: SysMenu | null = parent;
    while (cursor) {
      if (cursor.id === currentId) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, '不能把菜单移动到自己的子级下');
      }
      cursor = cursor.parent_id ? await menuRepo().findOneBy({ id: cursor.parent_id }) : null;
    }
  }
}

/** 表单菜单需要在列表里展示表单名称，避免用户只看到一串 /biz/xxx */
async function fillFormNames(nodes: MenuDto[]): Promise<void> {
  const ids = new Set<number>();
  const walk = (items: MenuDto[]): void => {
    for (const item of items) {
      if (item.type === 'FORM' && item.formId) ids.add(item.formId);
      if (item.children.length > 0) walk(item.children);
    }
  };
  walk(nodes);
  if (ids.size === 0) return;

  const forms = await formRepo().find({
    where: [...ids].map((id) => ({ id })),
    select: { id: true, name: true },
  });
  const nameMap = new Map(forms.map((form) => [form.id, form.name]));

  const assign = (items: MenuDto[]): void => {
    for (const item of items) {
      if (item.type === 'FORM' && item.formId) {
        item.formName = nameMap.get(item.formId) ?? null;
      }
      if (item.children.length > 0) assign(item.children);
    }
  };
  assign(nodes);
}

export async function listMenus() {
  const tree = buildTree(await menuRepo().find({ order: { sort: 'ASC', id: 'ASC' } }));
  await fillFormNames(tree);
  return tree;
}

export async function getMenu(id: number) {
  const menu = await menuRepo().findOneBy({ id });
  if (!menu) throw new AppError(ERROR_CODES.NOT_FOUND, '菜单不存在');
  const dto = toDto(menu);
  if (dto.type === 'FORM' && dto.formId) {
    const form = await formRepo().findOneBy({ id: dto.formId });
    dto.formName = form?.name ?? null;
  }
  return dto;
}

export async function createMenu(input: CreateMenuInput) {
  if (input.perm) {
    const exists = await menuRepo().findOne({ where: { perm: input.perm }, withDeleted: true });
    if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '权限标识已存在');
  }
  await assertParentValid(input.parentId);

  const binding = input.type === 'FORM' ? await resolveFormMenu(input.formId) : null;
  if (binding) await assertFormNotBound(binding.formId);

  const path = binding ? binding.path : input.path ?? null;
  const component = binding ? binding.component : input.component ?? null;
  const perm = input.perm ?? (binding ? formMenuPerm(binding.formKey, 'list') : null);
  validateShape(input.type, path, component, perm);
  if (binding) assertFormPermNamespace(binding.formKey, perm);

  const menu = menuRepo().create({
    parent_id: input.parentId ?? null,
    name: input.name,
    type: input.type,
    form_id: binding ? binding.formId : null,
    path,
    component,
    perm,
    icon: input.icon ?? null,
    sort: input.sort,
    visible: input.visible,
    status: input.status,
  });
  await menuRepo().save(menu);
  return getMenu(menu.id);
}

export async function updateMenu(id: number, input: UpdateMenuInput) {
  const menu = await menuRepo().findOneBy({ id });
  if (!menu) throw new AppError(ERROR_CODES.NOT_FOUND, '菜单不存在');

  if (input.parentId !== undefined) await assertParentValid(input.parentId, id);
  if (input.perm && input.perm !== menu.perm) {
    const exists = await menuRepo().findOne({ where: { perm: input.perm }, withDeleted: true });
    if (exists && exists.id !== id) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '权限标识已存在');
    }
  }

  const nextType = (input.type ?? menu.type) as SysMenuType;
  const nextFormId =
    nextType === 'FORM' ? (input.formId !== undefined ? input.formId : menu.form_id) : null;

  const binding = nextType === 'FORM' ? await resolveFormMenu(nextFormId) : null;
  if (binding) await assertFormNotBound(binding.formId, id);

  const nextPath = binding ? binding.path : input.path !== undefined ? input.path : menu.path;
  const nextComponent = binding
    ? binding.component
    : input.component !== undefined
      ? input.component
      : menu.component;
  const nextPerm =
    input.perm !== undefined
      ? input.perm
      : menu.perm ?? (binding ? formMenuPerm(binding.formKey, 'list') : null);
  validateShape(nextType, nextPath, nextComponent, nextPerm);
  if (binding) assertFormPermNamespace(binding.formKey, nextPerm);

  const patch = {
    ...(input.parentId !== undefined ? { parent_id: input.parentId ?? null } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    form_id: binding ? binding.formId : null,
    path: nextPath,
    component: nextComponent,
    perm: nextPerm,
    ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.visible !== undefined ? { visible: input.visible } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  // 空更新体会让 TypeORM 抛错，直接视为无改动
  if (Object.keys(patch).length > 0) await menuRepo().update(id, patch);

  return getMenu(id);
}

export interface GenerateFormMenuInput {
  formId: number;
  parentId?: number | null;
}

/**
 * 一次建好「表单页面菜单 + 查询/新增/编辑/删除权限点」，
 * 避免用户建完页面还要手写 3 个按钮权限。
 */
export async function generateFormMenu(input: GenerateFormMenuInput) {
  const binding = await resolveFormMenu(input.formId);
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = await menuRepo().findOneBy({ id: parentId });
    if (!parent) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '上级菜单不存在');
    if (parent.type !== 'DIR') {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '上级菜单只能选择目录');
    }
  }

  return AppDataSource.transaction(async (manager) => {
    const txRepo = manager.getRepository(SysMenu);

    const existing = await txRepo.findOne({
      where: { form_id: binding.formId, type: 'FORM' },
      withDeleted: true,
    });
    if (existing && !existing.deletedAt) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        '该表单已生成过菜单，请到「系统管理 - 菜单管理」查看或调整',
      );
    }

    const pagePerm = formMenuPerm(binding.formKey, 'list');
    const permTaken = await txRepo.findOne({ where: { perm: pagePerm } });
    if (permTaken) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `权限标识 ${pagePerm} 已存在，请先清理旧菜单`);
    }
    // 同一个 path 挂两份菜单会生成重复路由，提前拦掉
    const pathTaken = await txRepo.findOne({ where: { path: binding.path }, withDeleted: true });
    if (pathTaken) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `路由 ${binding.path} 已被菜单「${pathTaken.name}」占用，请先删除或改用它`,
      );
    }

    const siblings = await txRepo.find({
      where: { parent_id: parentId ?? IsNull() },
      select: { id: true, sort: true },
    });
    const sort = siblings.reduce((max, item) => Math.max(max, item.sort), 0) + 1;

    const menu = txRepo.create({
      parent_id: parentId,
      name: binding.name,
      type: 'FORM',
      form_id: binding.formId,
      path: binding.path,
      component: binding.component,
      perm: pagePerm,
      icon: 'Document',
      sort,
      visible: true,
      status: 'ENABLED',
    });
    await txRepo.save(menu);

    const buttons: Array<{ id: number; name: string; perm: string }> = [];
    for (const [index, item] of FORM_MENU_BUTTONS.entries()) {
      const perm = formMenuPerm(binding.formKey, item.action);
      // 权限标识全局唯一，已存在就跳过，保证可重复执行
      const taken = await txRepo.findOne({ where: { perm }, withDeleted: true });
      if (taken) continue;
      const button = txRepo.create({
        parent_id: menu.id,
        name: item.name,
        type: 'BUTTON',
        form_id: null,
        path: null,
        component: null,
        perm,
        icon: null,
        sort: index + 1,
        visible: false,
        status: 'ENABLED',
      });
      await txRepo.save(button);
      buttons.push({ id: button.id, name: button.name, perm });
    }

    await grantMenuToDefaultRoles(manager, [menu.id, ...buttons.map((item) => item.id)]);

    return {
      menuId: menu.id,
      name: menu.name,
      path: menu.path,
      component: menu.component,
      perm: menu.perm,
      parentId,
      formId: binding.formId,
      formKey: binding.formKey,
      buttons,
    };
  });
}

/* ---------------- 生成页菜单（下载代码时顺带建好） ---------------- */

interface PageMenuBinding {
  formId: number;
  name: string;
  formKey: string;
  path: string;
  component: string;
}

/**
 * 生成页菜单指向代码产物 `admin/src/views/biz/<form_key>/index.vue`，
 * 与 zip 里落盘的组件路径完全一致，解压后即可点开。
 */
async function resolvePageMenu(formId: number): Promise<PageMenuBinding> {
  const form = await formRepo().findOneBy({ id: formId });
  if (!form) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '所选表单不存在');
  return {
    formId: form.id,
    name: form.name,
    formKey: form.form_key,
    path: `/biz/${form.form_key}`,
    component: `biz/${form.form_key}/index`,
  };
}

export interface EnsurePageMenuResult {
  /** 本次是否新建，false 表示菜单已存在（幂等） */
  created: boolean;
  menuId: number;
  name: string;
  path: string;
  component: string;
  perm: string;
  parentId: number | null;
  formId: number;
  formKey: string;
  buttons: Array<{ id: number; name: string; perm: string }>;
  /** 已存在但指向别的组件时的提示 */
  hint?: string;
}

/**
 * 确保「生成页菜单 + 三个按钮权限」存在。
 * 下载代码前调用一次，用户拿到的 zip 与菜单是配套的；重复调用不会产生脏数据。
 */
export async function ensureFormPageMenu(
  input: GenerateFormMenuInput,
): Promise<EnsurePageMenuResult> {
  const binding = await resolvePageMenu(input.formId);
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = await menuRepo().findOneBy({ id: parentId });
    if (!parent) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '上级菜单不存在');
    if (parent.type !== 'DIR') {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '上级菜单只能选择目录');
    }
  }

  return AppDataSource.transaction(async (manager) => {
    const txRepo = manager.getRepository(SysMenu);
    const pagePerm = formMenuPerm(binding.formKey, 'list');

    const existing = await txRepo.findOne({
      where: [{ form_id: binding.formId }, { path: binding.path }, { perm: pagePerm }],
      order: { id: 'ASC' },
    });
    if (existing) {
      const buttons = await txRepo.find({
        where: { parent_id: existing.id, type: 'BUTTON' },
        order: { sort: 'ASC', id: 'ASC' },
      });
      // 历史菜单可能从没分配过角色，这里顺手补上
      await grantMenuToDefaultRoles(manager, [existing.id, ...buttons.map((item) => item.id)]);
      return {
        created: false,
        menuId: existing.id,
        name: existing.name,
        path: existing.path ?? binding.path,
        component: existing.component ?? '',
        perm: existing.perm ?? pagePerm,
        parentId: existing.parent_id,
        formId: binding.formId,
        formKey: binding.formKey,
        buttons: buttons.map((item) => ({ id: item.id, name: item.name, perm: item.perm ?? '' })),
        hint:
          existing.component && existing.component !== binding.component
            ? `该表单已有菜单指向 ${existing.component}，需要独立页面请在菜单管理里把组件改为 ${binding.component}`
            : undefined,
      };
    }

    const siblings = await txRepo.find({
      where: { parent_id: parentId ?? IsNull() },
      select: { id: true, sort: true },
    });
    const sort = siblings.reduce((max, item) => Math.max(max, item.sort), 0) + 1;

    const menu = txRepo.create({
      parent_id: parentId,
      name: binding.name,
      type: 'MENU',
      form_id: null,
      path: binding.path,
      component: binding.component,
      perm: pagePerm,
      icon: 'Document',
      sort,
      visible: true,
      status: 'ENABLED',
    });
    await txRepo.save(menu);

    const buttons: EnsurePageMenuResult['buttons'] = [];
    for (const [index, item] of FORM_MENU_BUTTONS.entries()) {
      const perm = formMenuPerm(binding.formKey, item.action);
      const taken = await txRepo.findOne({ where: { perm }, withDeleted: true });
      if (taken) continue;
      const button = txRepo.create({
        parent_id: menu.id,
        name: item.name,
        type: 'BUTTON',
        form_id: null,
        path: null,
        component: null,
        perm,
        icon: null,
        sort: index + 1,
        visible: false,
        status: 'ENABLED',
      });
      await txRepo.save(button);
      buttons.push({ id: button.id, name: button.name, perm });
    }

    await grantMenuToDefaultRoles(manager, [menu.id, ...buttons.map((item) => item.id)]);

    return {
      created: true,
      menuId: menu.id,
      name: menu.name,
      path: binding.path,
      component: binding.component,
      perm: pagePerm,
      parentId,
      formId: binding.formId,
      formKey: binding.formKey,
      buttons,
    };
  });
}

export async function deleteMenu(id: number) {
  const menu = await menuRepo().findOneBy({ id });
  if (!menu) throw new AppError(ERROR_CODES.NOT_FOUND, '菜单不存在');

  // 页面下的按钮是它的权限点（表单菜单/生成页菜单都由系统生成），删页面时一并回收，
  // 否则用户还要逐个删三个按钮；只有非按钮子节点才需要人工处理。
  const children = await menuRepo().find({ where: { parent_id: id } });
  const blocking = children.filter((child) => child.type !== 'BUTTON');
  if (blocking.length > 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先删除子菜单');
  }

  const ids = [id, ...children.map((child) => child.id)];
  // 关联表不会被实体级 delete 自动清理，先断开角色关联
  await AppDataSource.createQueryBuilder()
    .delete()
    .from('sys_role_menus')
    .where('menu_id IN (:...ids)', { ids })
    .execute();

  await menuRepo().delete({ id: In(ids) });
}
