import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { QueryFailedError } from 'typeorm';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES } from '../utils/app-error';
import { logger } from '../utils/logger';

/**
 * 所有业务错误都走 HTTP 200 + 信封 code，前端只需判断 code。
 * 未知异常不把堆栈返回给客户端。
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(200).json({ code: err.code, message: err.message, data: null });
    return;
  }

  if (err instanceof ZodError) {
    res.status(200).json({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: err.issues[0]?.message ?? '参数校验失败',
      data: null,
    });
    return;
  }

  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? '文件超出大小限制' : `文件上传失败：${err.message}`;
    res.status(200).json({ code: ERROR_CODES.VALIDATION_FAILED, message, data: null });
    return;
  }

  // 唯一索引冲突是最常见的可预期错误，转成可读文案而不是 500
  if (err instanceof QueryFailedError) {
    const driverError = err.driverError as { code?: string; errno?: number } | undefined;
    const isUniqueViolation =
      driverError?.code === '23505' || // postgres
      driverError?.code === 'ER_DUP_ENTRY' || // mysql
      driverError?.code === 'SQLITE_CONSTRAINT_UNIQUE' || // sqlite
      driverError?.errno === 1062;
    if (isUniqueViolation) {
      res.status(200).json({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: '数据已存在，请勿重复提交',
        data: null,
      });
      return;
    }
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(200).json({ code: ERROR_CODES.VALIDATION_FAILED, message: '请求体不是合法的 JSON', data: null });
    return;
  }

  logger.error({ err, method: req.method, path: req.originalUrl }, '未处理异常');
  res.status(200).json({ code: ERROR_CODES.INTERNAL_ERROR, message: '服务器内部错误', data: null });
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(200).json({
    code: ERROR_CODES.NOT_FOUND,
    message: `接口不存在：${req.method} ${req.originalUrl}`,
    data: null,
  });
};
