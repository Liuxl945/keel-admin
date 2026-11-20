import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError, ERROR_CODES } from '../utils/app-error';

function firstIssueMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? '参数校验失败';
}

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new AppError(ERROR_CODES.VALIDATION_FAILED, firstIssueMessage(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new AppError(ERROR_CODES.VALIDATION_FAILED, firstIssueMessage(result.error)));
      return;
    }
    // Express 4 允许替换 query 对象，后续 service 读到的是已转换的类型
    req.query = result.data as typeof req.query;
    next();
  };
}
