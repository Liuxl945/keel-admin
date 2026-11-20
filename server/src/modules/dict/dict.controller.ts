import type { Request } from 'express';
import { ok } from '../../utils/response';
import type {
  CreateDictDataInput,
  CreateDictTypeInput,
  DictDataQuery,
  DictTypeQuery,
  UpdateDictDataInput,
  UpdateDictTypeInput,
} from './dict.dto';
import {
  createDictData,
  createDictType,
  deleteDictData,
  deleteDictType,
  getAllDictOptions,
  listDictData,
  listDictTypeOptions,
  listDictTypes,
  updateDictData,
  updateDictType,
} from './dict.service';

export async function listDictTypesController(req: Request) {
  return ok(await listDictTypes(req.query as unknown as DictTypeQuery));
}

export async function listDictTypeOptionsController() {
  return ok(await listDictTypeOptions());
}

export async function createDictTypeController(req: Request) {
  return ok(await createDictType(req.body as CreateDictTypeInput));
}

export async function updateDictTypeController(req: Request) {
  return ok(await updateDictType(Number(req.params.id), req.body as UpdateDictTypeInput));
}

export async function deleteDictTypeController(req: Request) {
  await deleteDictType(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function listDictDataController(req: Request) {
  return ok(await listDictData(req.query as unknown as DictDataQuery));
}

export async function createDictDataController(req: Request) {
  return ok(await createDictData(req.body as CreateDictDataInput));
}

export async function updateDictDataController(req: Request) {
  return ok(await updateDictData(Number(req.params.id), req.body as UpdateDictDataInput));
}

export async function deleteDictDataController(req: Request) {
  await deleteDictData(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function dictOptionsController() {
  return ok(await getAllDictOptions());
}
