import type { SysMenu } from '../../db/entities';

export interface MenuNodeDto {
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
  /** type=FORM 时指向在线表单，前端据此渲染运行时页面 */
  formId: number | null;
  children: MenuNodeDto[];
}

function toNode(menu: SysMenu): MenuNodeDto {
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
    children: [],
  };
}

function sortMenus(a: SysMenu, b: SysMenu): number {
  if (a.sort !== b.sort) return a.sort - b.sort;
  return a.id - b.id;
}

/**
 * 侧边栏/路由只需要 DIR 与 MENU；BUTTON 只参与权限集合，不进树。
 */
export function buildMenuTree(menus: SysMenu[], includeButtons = false): MenuNodeDto[] {
  const filtered = menus
    .filter((menu) => includeButtons || menu.type !== 'BUTTON')
    .filter((menu) => menu.status === 'ENABLED')
    .sort(sortMenus);

  const map = new Map<number, MenuNodeDto>();
  for (const menu of filtered) map.set(menu.id, toNode(menu));

  const roots: MenuNodeDto[] = [];
  for (const menu of filtered) {
    const node = map.get(menu.id)!;
    const parent = menu.parent_id ? map.get(menu.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function flattenMenus(menus: SysMenu[]): SysMenu[] {
  return menus.slice().sort(sortMenus);
}
