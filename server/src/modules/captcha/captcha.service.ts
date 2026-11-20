import crypto from 'node:crypto';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { randomCaptchaCode, renderCaptchaDataUrl } from './captcha.image';

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

/**
 * 进程内存储：单实例部署足够。多实例部署时替换为 Redis，
 * 调用方（auth.service）不需要改动。
 */
const store = new Map<string, CaptchaEntry>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

/** 内部方法会返回明文 code，仅供单测使用，路由层绝不外泄 */
export interface CaptchaRecord {
  captchaId: string;
  code: string;
  image: string;
  expiresIn: number;
}

export function createCaptchaRecord(length = 4): CaptchaRecord {
  if (store.size >= MAX_ENTRIES) {
    sweepExpired();
    if (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest) store.delete(oldest);
    }
  }

  const code = randomCaptchaCode(length);
  const captchaId = crypto.randomUUID();
  store.set(captchaId, { code, expiresAt: Date.now() + TTL_MS });

  return {
    captchaId,
    code,
    image: renderCaptchaDataUrl(code),
    expiresIn: Math.floor(TTL_MS / 1000),
  };
}

export function createCaptcha(): Omit<CaptchaRecord, 'code'> {
  const record = createCaptchaRecord();
  return { captchaId: record.captchaId, image: record.image, expiresIn: record.expiresIn };
}

/** 一次性校验：无论对错都立即作废，防止同一 id 被反复爆破 */
export function verifyCaptcha(captchaId: string, input: string): void {
  const entry = store.get(captchaId);
  store.delete(captchaId);

  if (!entry || entry.expiresAt <= Date.now()) {
    throw new AppError(ERROR_CODES.CAPTCHA_INVALID, '验证码已过期，请刷新后重试');
  }

  if (entry.code !== input.trim()) {
    throw new AppError(ERROR_CODES.CAPTCHA_INVALID, '验证码错误，请重新输入');
  }
}
