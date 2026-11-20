import { z } from 'zod';

/** 分片上传初始化：客户端带上文件元信息与指纹，服务端据此创建或复用会话 */
export const chunkInitSchema = z.object({
  /** 文件指纹（名称+大小+修改时间派生），同一文件重复上传可续传 */
  fileKey: z.string().min(1, '文件标识不能为空').max(255),
  fileName: z.string().min(1, '文件名不能为空').max(255),
  fileSize: z.number().int('文件大小不合法').positive('文件大小不合法'),
  mimeType: z.string().max(200).optional().default('application/octet-stream'),
  /** 期望分片大小（字节），服务端会夹到 [256KB, 配置上限] 并以返回值覆盖 */
  chunkSize: z.number().int('分片大小不合法').positive('分片大小不合法').optional(),
});

export type ChunkInitInput = z.infer<typeof chunkInitSchema>;
