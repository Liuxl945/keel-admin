import type { Request, Response } from 'express';
import { sendCodeArchive } from '../../utils/code-archive';
import { ok } from '../../utils/response';
import type {
  DevModelQuery,
  DevModelSchemaInput,
  ImportExistingModelInput,
  UpdateDevModelInput,
} from './dev-model.dto';
import {
  createDevModel,
  deleteDevModel,
  getDevModel,
  getDevModelCode,
  getDevModelCodeArchive,
  importExistingModel,
  listDevModels,
  previewDevModelDdl,
  publishDevModel,
  updateDevModel,
} from './dev-model.service';

export async function listDevModelsController(req: Request) {
  return ok(await listDevModels(req.query as unknown as DevModelQuery));
}

export async function getDevModelController(req: Request) {
  return ok(await getDevModel(Number(req.params.id)));
}

export async function createDevModelController(req: Request) {
  return ok(
    await createDevModel(req.body as DevModelSchemaInput, req.auth!),
    '模型已创建',
  );
}

export async function updateDevModelController(req: Request) {
  return ok(
    await updateDevModel(Number(req.params.id), req.body as UpdateDevModelInput, req.auth!),
    '模型已保存',
  );
}

export async function importExistingModelController(req: Request) {
  return ok(
    await importExistingModel(req.body as ImportExistingModelInput, req.auth!),
    '模型已导入',
  );
}

export async function deleteDevModelController(req: Request) {
  await deleteDevModel(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function previewDevModelDdlController(req: Request) {
  return ok(await previewDevModelDdl(Number(req.params.id)));
}

export async function publishDevModelController(req: Request) {
  return ok(await publishDevModel(Number(req.params.id), req.auth!), '发布成功');
}

export async function getDevModelCodeController(req: Request) {
  return ok(await getDevModelCode(Number(req.params.id)));
}

export async function downloadDevModelCodeController(req: Request, res: Response) {
  sendCodeArchive(res, await getDevModelCodeArchive(Number(req.params.id)));
}
