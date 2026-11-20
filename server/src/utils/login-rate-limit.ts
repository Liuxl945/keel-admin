import { AppError, ERROR_CODES } from './app-error';

interface FailureRecord {
  count: number;
  firstAt: number;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * 登录失败限流。当前是进程内实现，单实例足够；
 * 多实例部署时替换为 Redis，调用方无需改动。
 */
const failures = new Map<string, FailureRecord>();

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

export function assertLoginAllowed(key: string): void {
  const record = failures.get(normalizeKey(key));
  if (!record) return;
  if (Date.now() - record.firstAt > WINDOW_MS) {
    failures.delete(normalizeKey(key));
    return;
  }
  if (record.count >= MAX_FAILURES) {
    throw new AppError(ERROR_CODES.TOO_MANY_REQUESTS, '登录失败次数过多，请 10 分钟后再试');
  }
}

export function recordLoginFailure(key: string): void {
  const normalized = normalizeKey(key);
  const record = failures.get(normalized);
  if (!record || Date.now() - record.firstAt > WINDOW_MS) {
    failures.set(normalized, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
}

export function clearLoginFailures(key: string): void {
  failures.delete(normalizeKey(key));
}
