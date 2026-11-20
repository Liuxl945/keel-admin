import type { Request } from 'express';
import { ok } from '../../utils/response';
import type { CreateMenuInput, UpdateMenuInput } from './menu.dto';
import { createMenu, deleteMenu, getMenu, listMenus, updateMenu } from './menu.service';

export async function listMenusController() {
  return ok(await listMenus());
}

export async function getMenuController(req: Request) {
  return ok(await getMenu(Number(req.params.id)));
}

export async function createMenuController(req: Request) {
  return ok(await createMenu(req.body as CreateMenuInput));
}

export async function updateMenuController(req: Request) {
  return ok(await updateMenu(Number(req.params.id), req.body as UpdateMenuInput));
}

export async function deleteMenuController(req: Request) {
  await deleteMenu(Number(req.params.id));
  return ok(null, '删除成功');
}
