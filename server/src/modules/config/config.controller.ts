import type { Request } from 'express';
import { ok } from '../../utils/response';
import type { UpdateConfigsInput } from './config.dto';
import { getPublicConfigs, listConfigs, updateConfigs } from './config.service';

export async function listConfigsController() {
  return ok(await listConfigs());
}

export async function updateConfigsController(req: Request) {
  const { items } = req.body as UpdateConfigsInput;
  return ok(await updateConfigs(items), '配置已保存');
}

export async function publicConfigsController() {
  return ok(await getPublicConfigs());
}
