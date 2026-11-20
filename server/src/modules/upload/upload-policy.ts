import path from 'node:path';
import { AppError, ERROR_CODES } from '../../utils/app-error';

/** mime → 扩展名，覆盖图片/视频/音频/Office/PDF/文本/压缩包等常见类型 */
const MIME_EXTENSIONS: Record<string, string> = {
  // 图片
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  // 视频
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-ms-wmv': '.wmv',
  'video/x-flv': '.flv',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'video/mpeg': '.mpeg',
  // 音频
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/aac': '.aac',
  'audio/mp4': '.m4a',
  // 文档
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/json': '.json',
  'application/xml': '.xml',
  'text/xml': '.xml',
  // 压缩包
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/vnd.rar': '.rar',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  'application/x-tar': '.tar',
  'application/gzip': '.gz',
};

/**
 * 可落盘扩展名白名单：与 MIME_EXTENSIONS 保持一致，
 * 不含 html/js/svg/exe/sh 等可执行或有 XSS 风险的类型（/uploads 是静态目录）。
 */
const ALLOWED_EXTENSIONS = new Set<string>([...Object.values(MIME_EXTENSIONS), '.jpeg', '.jfif']);

export interface UploadTypeInput {
  originalname: string;
  mimetype: string;
}

/**
 * 定扩展名：优先按 mime 映射；浏览器对 Office / 压缩包常报
 * application/octet-stream，此时回退原始文件名的扩展名。
 */
export function resolveExtension(file: UploadTypeInput): string | null {
  const pureMime = String(file.mimetype ?? '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  const fromMime = MIME_EXTENSIONS[pureMime];
  if (fromMime) return fromMime;
  const raw = path.extname(String(file.originalname ?? '')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(raw) ? raw : null;
}

/** 统一的不支持类型错误：分片初始化和整文件上传共用同一套白名单 */
export function assertAllowedType(file: UploadTypeInput): string {
  const ext = resolveExtension(file);
  if (!ext) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      '不支持的文件类型，请上传图片、视频、Office 文档、PDF 或压缩包',
    );
  }
  return ext;
}

export function isAllowedExtension(ext: string): boolean {
  return ALLOWED_EXTENSIONS.has(ext.toLowerCase());
}
