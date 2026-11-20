import type { RequestHandler } from 'express';
import {
  createOperationLog,
} from '../modules/log/log.service';
import { serializeBody, serializePayload, serializeQuery } from '../modules/log/log-payload';
import { logger } from '../utils/logger';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 「删日志表本身」的接口不能再写回日志表，否则审计链路自噬。
 * 新增此类接口必须加入这里，并改记 pino。
 */
export const SELF_AUDIT_EXEMPT_PATHS = [
  '/api/admin/logs/operation-logs/batch-delete',
  '/api/admin/logs/login-logs/batch-delete',
];

function isExempt(url: string): boolean {
  const path = url.split('?')[0];
  return SELF_AUDIT_EXEMPT_PATHS.some((exempt) => path.startsWith(exempt));
}

/**
 * 分片上传的每个 part 都是技术性请求：一次 1GB 上传会产生上百个请求，
 * 全写审计表会把日志刷爆。真正的落库行为由 complete 那一条日志记录。
 */
const CHUNK_PART_PATTERN = /\/upload\/chunk\/[a-f0-9]+\/part$/;

export const operationLogger: RequestHandler = (req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (CHUNK_PART_PATTERN.test(req.originalUrl.split('?')[0])) {
    next();
    return;
  }

  if (isExempt(req.originalUrl)) {
    logger.info(
      { method: req.method, path: req.originalUrl, operator: req.auth?.username },
      '审计日志清理操作（不写回自身日志表）',
    );
    next();
    return;
  }

  const startedAt = Date.now();
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const envelope = body as { code?: number } | undefined;
    const path = req.originalUrl.split('?')[0];
    const payload = {
      user_id: req.auth?.userId ?? null,
      username: req.auth?.username ?? null,
      method: req.method,
      path,
      status_code: res.statusCode,
      biz_code: typeof envelope?.code === 'number' ? envelope.code : null,
      duration_ms: Date.now() - startedAt,
      ip: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
      query: serializeQuery(req.query),
      body: serializeBody(req.body, req.headers['content-type']),
      response: serializePayload(body),
    };

    void createOperationLog(payload).catch((err) => {
      logger.error({ err }, '操作日志写入失败');
    });

    return originalJson(body);
  };

  next();
};
