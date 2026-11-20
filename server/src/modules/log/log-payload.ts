import { logger } from '../../utils/logger';

const SENSITIVE_KEY = /pass(word)?|pwd|token|secret|credential|authorization|cookie|openid|session_key/i;
const MAX_LENGTH = 4000;
const MAX_DEPTH = 6;

/** 脱敏后统一截断，避免超大请求体把日志表撑爆 */
function truncate(text: string): string {
  if (text.length <= MAX_LENGTH) return text;
  return `${text.slice(0, MAX_LENGTH)}…（内容已截断）`;
}

export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[层级过深已省略]';

  if (typeof value === 'string') {
    return value.length > MAX_LENGTH ? `${value.slice(0, MAX_LENGTH)}…（内容已截断）` : value;
  }

  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? '***' : sanitizePayload(item, depth + 1);
  }
  return output;
}

export function serializePayload(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return truncate(JSON.stringify(sanitizePayload(value)));
  } catch (err) {
    logger.warn({ err }, '操作日志序列化失败');
    return '[无法序列化]';
  }
}

export function serializeQuery(query: unknown): string | null {
  return serializePayload(query);
}

/** multipart 只留说明，避免把二进制内容写进日志 */
export function serializeBody(body: unknown, contentType: string | undefined): string | null {
  if (contentType?.includes('multipart/form-data')) {
    return '[multipart 表单，未记录内容]';
  }
  return serializePayload(body);
}
