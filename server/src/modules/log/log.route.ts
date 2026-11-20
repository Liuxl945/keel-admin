import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import { batchDeleteSchema } from '../../utils/pagination';
import {
  batchDeleteLoginLogsController,
  batchDeleteOperationLogsController,
  exportLoginLogsController,
  exportOperationLogsController,
  getOperationLogController,
  listLoginLogsController,
  listOperationLogsController,
} from './log.controller';
import { loginLogQuerySchema, operationLogQuerySchema } from './log.dto';

export const logRouter = Router();

logRouter.get(
  '/operation-logs',
  hasPerm('system:log'),
  validateQuery(operationLogQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listOperationLogsController(req));
  }),
);

logRouter.get(
  '/operation-logs/export',
  hasPerm('system:log'),
  asyncHandler(async (req, res) => {
    await exportOperationLogsController(req, res);
  }),
);

logRouter.get(
  '/operation-logs/:id',
  hasPerm('system:log'),
  asyncHandler(async (req, res) => {
    res.json(await getOperationLogController(req));
  }),
);

logRouter.post(
  '/operation-logs/batch-delete',
  hasPerm('system:log'),
  validateBody(batchDeleteSchema),
  asyncHandler(async (req, res) => {
    res.json(await batchDeleteOperationLogsController(req));
  }),
);

logRouter.get(
  '/login-logs',
  hasPerm('system:log'),
  validateQuery(loginLogQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listLoginLogsController(req));
  }),
);

logRouter.get(
  '/login-logs/export',
  hasPerm('system:log'),
  asyncHandler(async (req, res) => {
    await exportLoginLogsController(req, res);
  }),
);

logRouter.post(
  '/login-logs/batch-delete',
  hasPerm('system:log'),
  validateBody(batchDeleteSchema),
  asyncHandler(async (req, res) => {
    res.json(await batchDeleteLoginLogsController(req));
  }),
);
