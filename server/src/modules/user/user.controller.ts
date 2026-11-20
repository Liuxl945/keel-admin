import type { Request, Response } from 'express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { buildExcelBuffer, parseExcelBuffer, sendExcel, type ExcelColumn } from '../../utils/excel';
import { ok } from '../../utils/response';
import type { CreateUserInput, UpdateUserInput, UserQuery } from './user.dto';
import {
  assignRoles,
  createUser,
  deleteUser,
  getUser,
  importUsers,
  listUsers,
  listUsersForExport,
  resetPassword,
  updateStatus,
  updateUser,
} from './user.service';

function hasPerm(req: Request, perm: string): boolean {
  return Boolean(req.auth?.isSuperAdmin || req.permissions?.includes(perm));
}

export async function listUsersController(req: Request) {
  return ok(await listUsers(req.query as unknown as UserQuery));
}

export async function getUserController(req: Request) {
  return ok(await getUser(Number(req.params.id)));
}

export async function createUserController(req: Request) {
  const input = req.body as CreateUserInput;
  if (input.roleIds.length > 0 && !hasPerm(req, 'user:assign')) {
    throw new AppError(ERROR_CODES.FORBIDDEN, '无权分配角色');
  }
  return ok(await createUser(input, req.auth!));
}

export async function updateUserController(req: Request) {
  return ok(await updateUser(Number(req.params.id), req.body as UpdateUserInput, req.auth!));
}

export async function deleteUserController(req: Request) {
  await deleteUser(Number(req.params.id), req.auth!);
  return ok(null, '删除成功');
}

export async function assignRolesController(req: Request) {
  const { roleIds } = req.body as { roleIds: number[] };
  return ok(await assignRoles(Number(req.params.id), roleIds, req.auth!));
}

export async function resetPasswordController(req: Request) {
  const { password } = req.body as { password: string };
  await resetPassword(Number(req.params.id), password, req.auth!);
  return ok(null, '密码已重置');
}

export async function updateStatusController(req: Request) {
  const { status } = req.body as { status: 'ENABLED' | 'DISABLED' };
  return ok(await updateStatus(Number(req.params.id), status, req.auth!));
}

const EXPORT_COLUMNS: ExcelColumn[] = [
  { header: '账号', key: 'username', width: 20 },
  { header: '昵称', key: 'nickname', width: 20 },
  { header: '邮箱', key: 'email', width: 26 },
  { header: '手机号', key: 'phone', width: 18 },
  { header: '状态', key: 'status', width: 12 },
  { header: '角色', key: 'roles', width: 24 },
  { header: '创建时间', key: 'createdAt', width: 22 },
];

const IMPORT_COLUMNS: ExcelColumn[] = [
  { header: '账号', key: 'username', width: 20 },
  { header: '昵称', key: 'nickname', width: 20 },
  { header: '初始密码', key: 'password', width: 20 },
  { header: '邮箱', key: 'email', width: 26 },
  { header: '手机号', key: 'phone', width: 18 },
  { header: '状态', key: 'status', width: 12 },
];

export async function exportUsersController(req: Request, res: Response) {
  const rows = await listUsersForExport(req.query as unknown as UserQuery);
  const buffer = await buildExcelBuffer('用户数据', EXPORT_COLUMNS, rows);
  sendExcel(res, buffer, `用户数据_${Date.now()}.xlsx`);
}

export async function downloadUserTemplateController(_req: Request, res: Response) {
  const buffer = await buildExcelBuffer('用户导入模板', IMPORT_COLUMNS, [
    {
      username: 'demo_user',
      nickname: '演示用户',
      password: 'Demo@123456',
      email: '',
      phone: '',
      status: '启用',
    },
  ]);
  sendExcel(res, buffer, '用户导入模板.xlsx');
}

export async function importUsersController(req: Request) {
  if (!req.file) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请选择要导入的 Excel 文件');
  const rows = await parseExcelBuffer(req.file.buffer);
  if (rows.length === 0) throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Excel 中没有可导入的数据');
  const result = await importUsers(rows, req.auth!);
  return ok(result, `导入完成：成功 ${result.success} 条，跳过 ${result.skipped} 条`);
}
