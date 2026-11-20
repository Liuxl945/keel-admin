import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createDevApiController,
  deleteDevApiController,
  getDevApiController,
  listDevApisController,
  publishDevApiController,
  runDevApiController,
  updateDevApiController,
} from './dev-api.controller';
import {
  createDevApiSchema,
  devApiQuerySchema,
  runDevApiSchema,
  updateDevApiSchema,
} from './dev-api.dto';

export const devApiRouter = Router();

devApiRouter.get(
  '/',
  hasPerm('dev_api:list'),
  validateQuery(devApiQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listDevApisController(req));
  }),
);

devApiRouter.post(
  '/',
  hasPerm('dev_api:create'),
  validateBody(createDevApiSchema),
  asyncHandler(async (req, res) => {
    res.json(await createDevApiController(req));
  }),
);

devApiRouter.get(
  '/:id',
  hasPerm('dev_api:list'),
  asyncHandler(async (req, res) => {
    res.json(await getDevApiController(req));
  }),
);

devApiRouter.put(
  '/:id',
  hasPerm('dev_api:update'),
  validateBody(updateDevApiSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDevApiController(req));
  }),
);

devApiRouter.delete(
  '/:id',
  hasPerm('dev_api:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteDevApiController(req));
  }),
);

devApiRouter.post(
  '/:id/publish',
  hasPerm('dev_api:publish'),
  asyncHandler(async (req, res) => {
    res.json(await publishDevApiController(req));
  }),
);

/** 在线调试执行：参数值全部走绑定，返回结果按字段映射输出 */
devApiRouter.post(
  '/:id/run',
  hasPerm('dev_api:run'),
  validateBody(runDevApiSchema),
  asyncHandler(async (req, res) => {
    res.json(await runDevApiController(req));
  }),
);
