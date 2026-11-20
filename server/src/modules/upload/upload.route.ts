import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config';
import { hasPerm } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import { chunkBodyLimit } from './chunk-upload.service';
import {
  cancelChunkController,
  completeChunkController,
  initChunkController,
  statusChunkController,
  uploadChunkController,
  uploadController,
} from './upload.controller';
import { chunkInitSchema } from './upload.dto';

/** 整文件上传（兼容旧调用方）：受 UPLOAD_MAX_SIZE_MB 限制 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_SIZE_MB * 1024 * 1024, files: 1 },
});

/** 分片上传：单请求只允许一片 + 1MB 余量 */
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: chunkBodyLimit(), files: 1 },
});

export const uploadRouter = Router();

uploadRouter.post(
  '/',
  hasPerm('system:upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    res.json(await uploadController(req));
  }),
);

/**
 * 分片上传协议（前端 api/upload.ts 统一走这一套）：
 * init → part × N → complete，中断后重复 init 即可拿到已上传分片继续传。
 */
uploadRouter.post(
  '/chunk/init',
  hasPerm('system:upload'),
  validateBody(chunkInitSchema),
  asyncHandler(async (req, res) => {
    res.json(await initChunkController(req));
  }),
);

uploadRouter.post(
  '/chunk/:uploadId/part',
  hasPerm('system:upload'),
  chunkUpload.single('chunk'),
  asyncHandler(async (req, res) => {
    res.json(await uploadChunkController(req));
  }),
);

uploadRouter.post(
  '/chunk/:uploadId/complete',
  hasPerm('system:upload'),
  asyncHandler(async (req, res) => {
    res.json(await completeChunkController(req));
  }),
);

uploadRouter.get(
  '/chunk/:uploadId',
  hasPerm('system:upload'),
  asyncHandler(async (req, res) => {
    res.json(await statusChunkController(req));
  }),
);

uploadRouter.delete(
  '/chunk/:uploadId',
  hasPerm('system:upload'),
  asyncHandler(async (req, res) => {
    res.json(await cancelChunkController(req));
  }),
);
