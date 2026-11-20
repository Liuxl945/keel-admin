/**
 * 业务错误码唯一来源。新增错误码先加在这里，
 * 业务代码引用常量而不是裸写数字，避免出现同码不同义。
 */
export const ERROR_CODES = {
  SUCCESS: 0,

  VALIDATION_FAILED: 40001,
  LOGIN_FAILED: 40002,
  CAPTCHA_INVALID: 40004,

  UNAUTHORIZED: 40101,
  REFRESH_TOKEN_INVALID: 40102,

  ACCOUNT_DISABLED_FORBIDDEN: 40301,
  AUDIENCE_MISMATCH: 40302,
  FORBIDDEN: 40310,

  NOT_FOUND: 40401,

  TOO_MANY_REQUESTS: 42900,

  INTERNAL_ERROR: 50000,
} as const;

export class AppError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
