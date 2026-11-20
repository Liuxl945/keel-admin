import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createDevModelController,
  deleteDevModelController,
  downloadDevModelCodeController,
  getDevModelCodeController,
  getDevModelController,
  importExistingModelController,
  listDevModelsController,
  previewDevModelDdlController,
  publishDevModelController,
  updateDevModelController,
} from './dev-model.controller';
import {
  devModelQuerySchema,
  devModelSchema,
  importExistingModelSchema,
  updateDevModelSchema,
} from './dev-model.dto';

export const devModelRouter = Router();

devModelRouter.get(
  '/',
  hasPerm('dev_model:list'),
  validateQuery(devModelQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listDevModelsController(req));
  }),
);

devModelRouter.post(
  '/',
  hasPerm('dev_model:create'),
  validateBody(devModelSchema),
  asyncHandler(async (req, res) => {
    res.json(await createDevModelController(req));
  }),
);

devModelRouter.post(
  '/import-existing',
  hasPerm('dev_model:create'),
  validateBody(importExistingModelSchema),
  asyncHandler(async (req, res) => {
    res.json(await importExistingModelController(req));
  }),
);

devModelRouter.get(
  '/:id/ddl',
  hasPerm('dev_model:list'),
  asyncHandler(async (req, res) => {
    res.json(await previewDevModelDdlController(req));
  }),
);

devModelRouter.post(
  '/:id/publish',
  hasPerm('dev_model:ddl'),
  asyncHandler(async (req, res) => {
    res.json(await publishDevModelController(req));
  }),
);

// 兼容旧前端/脚本，语义与 publish 一致
devModelRouter.post(
  '/:id/create-table',
  hasPerm('dev_model:ddl'),
  asyncHandler(async (req, res) => {
    res.json(await publishDevModelController(req));
  }),
);

devModelRouter.get(
  '/:id/code',
  hasPerm('dev_model:list'),
  asyncHandler(async (req, res) => {
    res.json(await getDevModelCodeController(req));
  }),
);

devModelRouter.get(
  '/:id/code/zip',
  hasPerm('dev_model:list'),
  asyncHandler(async (req, res) => {
    await downloadDevModelCodeController(req, res);
  }),
);

devModelRouter.get(
  '/:id',
  hasPerm('dev_model:list'),
  asyncHandler(async (req, res) => {
    res.json(await getDevModelController(req));
  }),
);

devModelRouter.put(
  '/:id',
  hasPerm('dev_model:update'),
  validateBody(updateDevModelSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDevModelController(req));
  }),
);

devModelRouter.delete(
  '/:id',
  hasPerm('dev_model:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteDevModelController(req));
  }),
);
