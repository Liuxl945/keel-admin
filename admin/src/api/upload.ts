import type { AxiosError } from 'axios';
import { http } from './request';

export interface UploadedFile {
  id?: number;
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface UploadOptions {
  /** 上传进度回调：0-100 的整数 */
  onProgress?: (percent: number) => void;
  /** 自定义分片大小（字节），不传则使用服务端默认值 */
  chunkSize?: number;
  /** 单个分片的最大重试次数，默认 3 */
  retries?: number;
  /** 取消上传 */
  signal?: AbortSignal;
}

interface ChunkInitResult {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  /** 服务端已收到的分片序号：断点续传时跳过这些片 */
  uploaded: number[];
}

const DEFAULT_RETRIES = 3;
/** 单片上传超时：5MB 在弱网下也可能要几十秒 */
const CHUNK_TIMEOUT = 60_000;
/** 合并大文件可能耗时较久，单独放宽 */
const COMPLETE_TIMEOUT = 300_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbort(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ERR_CANCELED';
}

/** 分片请求都是静默的，错误文案在这里统一转成用户能懂的话 */
function toUploadError(error: unknown): Error {
  const axiosError = error as AxiosError<{ message?: string }>;
  if (isAbort(error)) return new Error('上传已取消');
  const serverMessage = axiosError?.response?.data?.message;
  if (serverMessage) return new Error(serverMessage);
  if (axiosError?.code === 'ECONNABORTED') return new Error('上传超时，请检查网络后重试');
  if (axiosError?.code === 'ERR_NETWORK') {
    return new Error('网络异常，上传已中断；重新选择该文件可继续上传');
  }
  return error instanceof Error ? error : new Error('上传失败');
}

/**
 * 文件指纹：名称 + 大小 + 最后修改时间。
 * 同一文件即使刷新页面/断网重连，指纹不变，服务端就能命中同一个上传会话继续传。
 */
async function fileFingerprint(file: File): Promise<string> {
  const raw = `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // 非安全上下文（http 内网访问）没有 SubtleCrypto，退化成可读指纹
    return `f${file.size}-${file.lastModified}-${encodeURIComponent(file.name)}`.slice(0, 240);
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** 单片刻度：按服务端返回的分片大小切片，最后一片可能更小 */
function chunkLengthOf(index: number, chunkSize: number, totalSize: number): number {
  return Math.min(chunkSize, totalSize - index * chunkSize);
}

async function sendChunk(
  uploadId: string,
  index: number,
  blob: Blob,
  onChunkProgress: (loaded: number) => void,
  retries: number,
  signal?: AbortSignal,
): Promise<void> {
  let attempt = 0;

  for (;;) {
    try {
      const form = new FormData();
      form.append('index', String(index));
      form.append('chunk', blob, `chunk-${index}`);
      await http.post(`/admin/upload/chunk/${uploadId}/part`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: CHUNK_TIMEOUT,
        signal,
        // 分片失败由这里统一重试，避免每片重试都弹一次全局错误
        _silent: true,
        onUploadProgress: (event) => onChunkProgress(Math.min(event.loaded ?? 0, blob.size)),
      });
      return;
    } catch (error) {
      if (isAbort(error)) throw error;
      attempt += 1;
      if (attempt > retries) throw error;
      // 线性退避：断网刚恢复时给服务端一点缓冲
      await delay(400 * attempt);
    }
  }
}

/**
 * 统一上传入口：所有文件都走「初始化 → 逐片上传 → 合并」协议。
 * - 断线续传：中断后再次选择同一个文件，服务端返回已收分片，自动跳过
 * - 分片重试：单片失败自动退避重试，不会让整个文件从头再来
 * - 进度：按已确认字节 + 当前片已发送字节计算，合并结束才到 100%
 */
export async function uploadFile(file: File, options: UploadOptions = {}): Promise<UploadedFile> {
  try {
    return await runChunkedUpload(file, options);
  } catch (error) {
    throw toUploadError(error);
  }
}

async function runChunkedUpload(file: File, options: UploadOptions): Promise<UploadedFile> {
  const { onProgress, retries = DEFAULT_RETRIES, signal } = options;

  const init = await http.post<ChunkInitResult>(
    '/admin/upload/chunk/init',
    {
      fileKey: await fileFingerprint(file),
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      chunkSize: options.chunkSize,
    },
    { timeout: 20_000, signal, _silent: true },
  );

  const { uploadId, chunkSize, totalChunks } = init;
  const done = new Set(init.uploaded);
  const report = (bytes: number): void => {
    if (!onProgress || file.size <= 0) return;
    // 合并阶段留 1%，避免进度条长时间停在 100% 却还没返回地址
    onProgress(Math.min(99, Math.round((bytes / file.size) * 100)));
  };

  let confirmed = 0;
  for (const index of done) confirmed += chunkLengthOf(index, chunkSize, file.size);
  report(confirmed);

  for (let index = 0; index < totalChunks; index += 1) {
    if (done.has(index)) continue;
    const start = index * chunkSize;
    const length = chunkLengthOf(index, chunkSize, file.size);
    // 分片顺序上传：并发抢带宽在弱网下反而更容易整片超时
    await sendChunk(
      uploadId,
      index,
      file.slice(start, start + length),
      (loaded) => report(confirmed + loaded),
      retries,
      signal,
    );
    confirmed += length;
    report(confirmed);
  }

  const result = await http.post<UploadedFile>(
    `/admin/upload/chunk/${uploadId}/complete`,
    undefined,
    { timeout: COMPLETE_TIMEOUT, signal, _silent: true },
  );
  onProgress?.(100);
  return result;
}
