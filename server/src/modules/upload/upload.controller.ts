import type { Request } from 'express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { ok } from '../../utils/response';
import { createFileRecord } from '../file/file.service';
import {
  cancelChunkUpload,
  completeChunkUpload,
  getChunkStatus,
  initChunkUpload,
  writeChunk,
} from './chunk-upload.service';
import type { ChunkInitInput } from './upload.dto';
import { storageProvider } from './storage/local-storage.provider';

/** 整文件上传：保留给脚本/第三方直传，后台前端统一走下面的分片协议 */
export async function uploadController(req: Request) {
  if (!req.file) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请选择要上传的文件');
  }

  const result = await storageProvider.save({
    buffer: req.file.buffer,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });

  // 文件记录用于后台「文件管理」页，落盘成功后再写库
  const record = await createFileRecord({
    filename: result.name,
    originalName: req.file.originalname,
    url: result.url,
    size: result.size,
    mimeType: result.mimeType,
    uploaderId: req.auth?.userId ?? null,
    uploaderName: req.auth?.username ?? null,
  });

  return ok({ id: record.id, ...result }, '上传成功');
}

/** 分片初始化：创建或复用会话，返回已收到的分片序号用于断点续传 */
export async function initChunkController(req: Request) {
  return ok(await initChunkUpload(req.body as ChunkInitInput), '上传已初始化');
}

export async function statusChunkController(req: Request) {
  return ok(await getChunkStatus(String(req.params.uploadId)));
}

/** 接收单个分片：序号由表单字段 index 传入 */
export async function uploadChunkController(req: Request) {
  if (!req.file) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '缺少分片内容');
  }
  const index = Number(req.body?.index);
  if (!Number.isInteger(index) || index < 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '分片序号不合法');
  }

  return ok(
    await writeChunk(String(req.params.uploadId), index, req.file.buffer),
    '分片已接收',
  );
}

/** 合并分片 → 落盘 → 写文件记录；成功后清理临时目录 */
export async function completeChunkController(req: Request) {
  const { stored, meta } = await completeChunkUpload(String(req.params.uploadId));

  const record = await createFileRecord({
    filename: stored.name,
    originalName: meta.fileName,
    url: stored.url,
    size: stored.size,
    mimeType: stored.mimeType,
    uploaderId: req.auth?.userId ?? null,
    uploaderName: req.auth?.username ?? null,
  });

  return ok({ id: record.id, ...stored }, '上传成功');
}

export async function cancelChunkController(req: Request) {
  await cancelChunkUpload(String(req.params.uploadId));
  return ok(null, '已取消上传');
}
