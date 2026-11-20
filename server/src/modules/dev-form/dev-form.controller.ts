import type { Request, Response } from 'express';
import { sendCodeArchive } from '../../utils/code-archive';
import { ok } from '../../utils/response';
import { ensureFormPageMenu, generateFormMenu } from '../menu/menu.service';
import type { CreateDevFormInput, DevFormQuery, UpdateDevFormInput } from './dev-form.dto';
import {
  createDevForm,
  deleteDevForm,
  getDevForm,
  getDevFormCode,
  getDevFormCodeArchive,
  listDevForms,
  previewDevFormCreate,
  previewDevFormDelete,
  previewDevFormDetails,
  previewDevFormList,
  previewDevFormUpdate,
  publishDevForm,
  updateDevForm,
} from './dev-form.service';

export async function listDevFormsController(req: Request) {
  return ok(await listDevForms(req.query as unknown as DevFormQuery));
}

export async function getDevFormController(req: Request) {
  return ok(await getDevForm(Number(req.params.id)));
}

export async function createDevFormController(req: Request) {
  return ok(await createDevForm(req.body as CreateDevFormInput, req.auth!), '表单已创建');
}

export async function updateDevFormController(req: Request) {
  return ok(
    await updateDevForm(Number(req.params.id), req.body as UpdateDevFormInput, req.auth!),
    '表单已保存',
  );
}

export async function publishDevFormController(req: Request) {
  return ok(await publishDevForm(Number(req.params.id), req.auth!), '表单已发布');
}

export async function deleteDevFormController(req: Request) {
  await deleteDevForm(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function getDevFormCodeController(req: Request) {
  return ok(await getDevFormCode(Number(req.params.id)));
}

/** 下载 zip：包内保留 server/、admin/ 目录结构，解压到项目根目录即落位 */
export async function downloadDevFormCodeController(req: Request, res: Response) {
  sendCodeArchive(res, await getDevFormCodeArchive(Number(req.params.id)));
}

export async function generateDevFormMenuController(req: Request) {
  const { parentId } = req.body as { parentId: number | null };
  return ok(
    await generateFormMenu({ formId: Number(req.params.id), parentId }),
    '菜单已生成',
  );
}

/** 生成页菜单（指向下载的 biz/<key>/index）：幂等，下载代码前调用 */
export async function ensureDevFormMenuController(req: Request) {
  const { parentId } = req.body as { parentId: number | null };
  const result = await ensureFormPageMenu({ formId: Number(req.params.id), parentId });
  return ok(result, result.created ? '菜单已生成' : '菜单已存在');
}

export async function previewDevFormListController(req: Request) {
  return ok(
    await previewDevFormList(Number(req.params.id), req.query as Record<string, unknown>),
  );
}

export async function previewDevFormCreateController(req: Request) {
  return ok(
    await previewDevFormCreate(Number(req.params.id), req.body as Record<string, unknown>),
    '新增成功',
  );
}

export async function previewDevFormUpdateController(req: Request) {
  return ok(
    await previewDevFormUpdate(
      Number(req.params.id),
      req.params.rowId,
      req.body as Record<string, unknown>,
    ),
    '更新成功',
  );
}

export async function previewDevFormDeleteController(req: Request) {
  return ok(
    await previewDevFormDelete(Number(req.params.id), req.params.rowId),
    '删除成功',
  );
}

export async function previewDevFormDetailsController(req: Request) {
  return ok(await previewDevFormDetails(Number(req.params.id), req.params.rowId));
}
