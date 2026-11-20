import type { Request } from 'express';
import { ok } from '../../utils/response';
import { deleteFile, listFiles, type FileQuery } from './file.service';

export async function listFilesController(req: Request) {
  return ok(await listFiles(req.query as unknown as FileQuery));
}

export async function deleteFileController(req: Request) {
  await deleteFile(Number(req.params.id));
  return ok(null, '文件已删除');
}
