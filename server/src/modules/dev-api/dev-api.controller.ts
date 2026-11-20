import type { Request } from 'express';
import { ok } from '../../utils/response';
import type {
  CreateDevApiInput,
  DevApiQuery,
  RunDevApiInput,
  UpdateDevApiInput,
} from './dev-api.dto';
import {
  createDevApi,
  deleteDevApi,
  getDevApi,
  listDevApis,
  publishDevApi,
  runDevApiById,
  updateDevApi,
} from './dev-api.service';

export async function listDevApisController(req: Request) {
  return ok(await listDevApis(req.query as unknown as DevApiQuery));
}

export async function getDevApiController(req: Request) {
  return ok(await getDevApi(Number(req.params.id)));
}

export async function createDevApiController(req: Request) {
  return ok(await createDevApi(req.body as CreateDevApiInput, req.auth!), '接口已创建');
}

export async function updateDevApiController(req: Request) {
  return ok(
    await updateDevApi(Number(req.params.id), req.body as UpdateDevApiInput, req.auth!),
    '接口已保存',
  );
}

export async function deleteDevApiController(req: Request) {
  await deleteDevApi(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function publishDevApiController(req: Request) {
  return ok(await publishDevApi(Number(req.params.id), req.auth!), '接口已发布');
}

export async function runDevApiController(req: Request) {
  return ok(await runDevApiById(Number(req.params.id), req.body as RunDevApiInput));
}
