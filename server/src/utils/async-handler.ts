import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 不会自动捕获 async 异常，统一在这里转交 errorHandler，
 * 这样业务 controller 可以保持线性写法。
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
