import type { Request } from 'express';
import { ok } from '../../utils/response';
import type { CreateRoleInput, RoleQuery, UpdateRoleInput } from './role.dto';
import {
  assignMenus,
  createRole,
  deleteRole,
  getRole,
  listRoleOptions,
  listRoles,
  updateRole,
} from './role.service';

export async function listRolesController(req: Request) {
  return ok(await listRoles(req.query as unknown as RoleQuery));
}

export async function listRoleOptionsController() {
  return ok(await listRoleOptions());
}

export async function getRoleController(req: Request) {
  return ok(await getRole(Number(req.params.id)));
}

export async function createRoleController(req: Request) {
  return ok(await createRole(req.body as CreateRoleInput));
}

export async function updateRoleController(req: Request) {
  return ok(await updateRole(Number(req.params.id), req.body as UpdateRoleInput));
}

export async function deleteRoleController(req: Request) {
  await deleteRole(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function assignMenusController(req: Request) {
  const { menuIds } = req.body as { menuIds: number[] };
  return ok(await assignMenus(Number(req.params.id), menuIds));
}
