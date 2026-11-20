import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../../config';
import { AppError, ERROR_CODES } from '../../../utils/app-error';
import { assertAllowedType } from '../upload-policy';
import type {
  StorageProvider,
  StoredFile,
  UploadFileFromPathInput,
  UploadFileInput,
} from './storage.provider';

function randomName(ext: string): string {
  return `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(baseDir = config.resolvePath(config.UPLOAD_DIR)) {
    this.baseDir = baseDir;
  }

  async save(file: UploadFileInput): Promise<StoredFile> {
    const ext = assertAllowedType(file);
    await fs.mkdir(this.baseDir, { recursive: true });

    const filename = randomName(ext);
    await fs.writeFile(path.join(this.baseDir, filename), file.buffer);

    return {
      url: `/uploads/${filename}`,
      name: filename,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /** 分片合并后的临时文件直接 move 进上传目录：同盘 rename 近似零成本 */
  async saveFromPath(file: UploadFileFromPathInput): Promise<StoredFile> {
    const ext = assertAllowedType(file);
    await fs.mkdir(this.baseDir, { recursive: true });

    const filename = randomName(ext);
    const target = path.join(this.baseDir, filename);
    try {
      await fs.rename(file.path, target);
    } catch (error) {
      // 临时目录与上传目录不在同一挂载点时 rename 会 EXDEV，退化成复制
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fs.copyFile(file.path, target);
      await fs.rm(file.path, { force: true });
    }

    return {
      url: `/uploads/${filename}`,
      name: filename,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async remove(filename: string): Promise<void> {
    const safeName = path.basename(filename);
    if (safeName !== filename) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '文件名不合法');
    }

    try {
      await fs.unlink(path.join(this.baseDir, safeName));
    } catch (error) {
      // 文件已不存在视为删除成功，避免脏记录无法清理
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export const storageProvider: StorageProvider = new LocalStorageProvider();
