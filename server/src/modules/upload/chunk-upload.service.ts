import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from '../../config';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { assertAllowedType } from './upload-policy';
import { storageProvider } from './storage/local-storage.provider';
import type { StoredFile } from './storage/storage.provider';

const MB = 1024 * 1024;
/** 分片下限 256KB：过小会让超大文件产生过多文件句柄 */
const MIN_CHUNK_SIZE = 256 * 1024;
/** 未完成会话保留 24 小时，超过则视为断点放弃并清理 */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/;
const CHUNK_FILE_PATTERN = /^(\d{6})\.part$/;

export interface ChunkInitInput {
  /** 客户端文件指纹：同名同大小同修改时间视为同一个文件，用于断点续传 */
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** 客户端期望的分片大小，服务端会夹到合法区间并以返回值为准 */
  chunkSize?: number;
}

export interface ChunkSessionMeta {
  uploadId: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  createdAt: string;
}

export interface ChunkInitResult {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  /** 已收到的分片序号，前端据此跳过，实现断点续传 */
  uploaded: number[];
}

function chunksRoot(): string {
  // 放在上传目录的隐藏子目录：express.static 默认 dotfiles:ignore，不会被外部访问到
  return path.join(config.resolvePath(config.UPLOAD_DIR), '.chunks');
}

function sessionDir(uploadId: string): string {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '上传会话标识不合法');
  }
  return path.join(chunksRoot(), uploadId);
}

function chunkPath(uploadId: string, index: number): string {
  return path.join(sessionDir(uploadId), `${String(index).padStart(6, '0')}.part`);
}

/** 上传会话 id 由文件指纹派生：同一个文件重复上传/刷新页面后仍能命中同一会话 */
function uploadIdOf(fileKey: string, fileSize: number): string {
  return crypto
    .createHash('sha256')
    .update(`${fileKey}:${fileSize}`)
    .digest('hex')
    .slice(0, 32);
}

function clampChunkSize(requested?: number): number {
  const max = config.UPLOAD_CHUNK_SIZE_MB * MB;
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) return max;
  return Math.min(Math.max(Math.floor(value), MIN_CHUNK_SIZE), max);
}

async function readMeta(uploadId: string): Promise<ChunkSessionMeta> {
  try {
    const raw = await fs.readFile(path.join(sessionDir(uploadId), 'meta.json'), 'utf8');
    return JSON.parse(raw) as ChunkSessionMeta;
  } catch {
    throw new AppError(ERROR_CODES.NOT_FOUND, '上传会话不存在或已过期，请重新上传');
  }
}

/** 已落盘的分片序号：以目录里的实际文件为准，进程重启后依然准确 */
async function listUploadedIndexes(uploadId: string): Promise<number[]> {
  try {
    const names = await fs.readdir(sessionDir(uploadId));
    return names
      .map((name) => CHUNK_FILE_PATTERN.exec(name))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

let lastCleanupAt = 0;

/** 惰性清理：初始化分片时顺带扫一遍过期会话，避免临时分片长期占盘 */
async function cleanupExpiredSessions(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  try {
    const entries = await fs.readdir(chunksRoot(), { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const dir = path.join(chunksRoot(), entry.name);
          try {
            const stat = await fs.stat(dir);
            if (now - stat.mtimeMs > SESSION_TTL_MS) {
              await fs.rm(dir, { recursive: true, force: true });
            }
          } catch {
            // 并发删除导致的 ENOENT 忽略即可
          }
        }),
    );
  } catch {
    // 目录还不存在：首次上传无需清理
  }
}

export async function initChunkUpload(input: ChunkInitInput): Promise<ChunkInitResult> {
  void cleanupExpiredSessions();

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '文件内容为空，无法上传');
  }
  if (input.fileSize > config.UPLOAD_MAX_FILE_SIZE_MB * MB) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `文件超过 ${config.UPLOAD_MAX_FILE_SIZE_MB}MB，无法上传`,
    );
  }
  // 类型白名单在初始化时就拦掉，避免白传完所有分片才失败
  assertAllowedType({ originalname: input.fileName, mimetype: input.mimeType });

  const uploadId = uploadIdOf(input.fileKey, input.fileSize);
  const dir = sessionDir(uploadId);
  const chunkSize = clampChunkSize(input.chunkSize);
  const totalChunks = Math.max(1, Math.ceil(input.fileSize / chunkSize));

  const existing = await readMeta(uploadId).catch(() => null);
  const reusable =
    existing &&
    existing.fileName === input.fileName &&
    existing.fileSize === input.fileSize &&
    existing.chunkSize === chunkSize;

  if (reusable) {
    return {
      uploadId,
      chunkSize: existing.chunkSize,
      totalChunks: existing.totalChunks,
      uploaded: await listUploadedIndexes(uploadId),
    };
  }

  // 指纹相同但体积/分片策略变了（同名文件被改写）：丢弃旧会话重来
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  const meta: ChunkSessionMeta = {
    uploadId,
    fileKey: input.fileKey,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    chunkSize,
    totalChunks,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');

  return { uploadId, chunkSize, totalChunks, uploaded: [] };
}

export async function writeChunk(
  uploadId: string,
  index: number,
  buffer: Buffer,
): Promise<{ index: number; uploadedCount: number; totalChunks: number }> {
  const meta = await readMeta(uploadId);
  if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '分片序号超出范围');
  }

  const expected =
    index === meta.totalChunks - 1
      ? meta.fileSize - index * meta.chunkSize
      : meta.chunkSize;
  if (buffer.length !== expected) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `分片大小不匹配（期望 ${expected} 字节，实际 ${buffer.length} 字节）`,
    );
  }

  await fs.mkdir(sessionDir(uploadId), { recursive: true });
  // 同一序号重复上传直接覆盖：响应丢失后重试天然幂等
  await fs.writeFile(chunkPath(uploadId, index), buffer);
  const uploaded = await listUploadedIndexes(uploadId);

  return { index, uploadedCount: uploaded.length, totalChunks: meta.totalChunks };
}

export interface ChunkCompleteResult {
  stored: StoredFile;
  meta: ChunkSessionMeta;
}

export async function completeChunkUpload(uploadId: string): Promise<ChunkCompleteResult> {
  const meta = await readMeta(uploadId);
  const uploaded = await listUploadedIndexes(uploadId);
  if (uploaded.length !== meta.totalChunks) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `分片不完整（${uploaded.length}/${meta.totalChunks}），请继续上传后再合并`,
    );
  }

  const dir = sessionDir(uploadId);
  const merged = path.join(dir, 'merged');
  await fs.rm(merged, { force: true });
  // 逐片追加合流，避免把大文件整体读进内存
  for (let i = 0; i < meta.totalChunks; i += 1) {
    await pipeline(
      createReadStream(chunkPath(uploadId, i)),
      createWriteStream(merged, { flags: 'a' }),
    );
  }

  const stat = await fs.stat(merged);
  if (stat.size !== meta.fileSize) {
    await fs.rm(dir, { recursive: true, force: true });
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      '合并后文件大小与声明不一致，请重新上传',
    );
  }

  const stored = await storageProvider.saveFromPath({
    path: merged,
    originalname: meta.fileName,
    mimetype: meta.mimeType,
    size: meta.fileSize,
  });
  await fs.rm(dir, { recursive: true, force: true });

  return { stored, meta };
}

export async function getChunkStatus(uploadId: string): Promise<ChunkInitResult> {
  const meta = await readMeta(uploadId);
  return {
    uploadId: meta.uploadId,
    chunkSize: meta.chunkSize,
    totalChunks: meta.totalChunks,
    uploaded: await listUploadedIndexes(uploadId),
  };
}

export async function cancelChunkUpload(uploadId: string): Promise<void> {
  await fs.rm(sessionDir(uploadId), { recursive: true, force: true });
}

/** 单请求体上限：一片的大小 + 1MB 余量，防止绕过分片直接怼大文件 */
export function chunkBodyLimit(): number {
  return config.UPLOAD_CHUNK_SIZE_MB * MB + MB;
}
