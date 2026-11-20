import { Router } from 'express';
import { hasAnyPerm, hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createDataSourceController,
  deleteDataSourceController,
  getDataSourceController,
  getDataSourceTablesController,
  listDataSourceOptionsController,
  listDataSourcesController,
  syncDataSourceTablesController,
  testDataSourceController,
  updateDataSourceController,
} from './dev-data-source.controller';
import {
  createDataSourceSchema,
  dataSourceQuerySchema,
  updateDataSourceSchema,
} from './dev-data-source.dto';

export const devDataSourceRouter = Router();

devDataSourceRouter.get(
  '/',
  hasPerm('dev_ds:list'),
  validateQuery(dataSourceQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listDataSourcesController(req));
  }),
);

devDataSourceRouter.get(
  '/options',
  hasPerm('dev_ds:list'),
  asyncHandler(async (_req, res) => {
    res.json(await listDataSourceOptionsController());
  }),
);

devDataSourceRouter.post(
  '/',
  hasPerm('dev_ds:create'),
  validateBody(createDataSourceSchema),
  asyncHandler(async (req, res) => {
    res.json(await createDataSourceController(req));
  }),
);

devDataSourceRouter.get(
  '/:id',
  hasPerm('dev_ds:list'),
  asyncHandler(async (req, res) => {
    res.json(await getDataSourceController(req));
  }),
);

devDataSourceRouter.put(
  '/:id',
  hasPerm('dev_ds:update'),
  validateBody(updateDataSourceSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDataSourceController(req));
  }),
);

devDataSourceRouter.delete(
  '/:id',
  hasPerm('dev_ds:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteDataSourceController(req));
  }),
);

devDataSourceRouter.post(
  '/:id/test',
  hasPerm('dev_ds:test'),
  asyncHandler(async (req, res) => {
    res.json(await testDataSourceController(req));
  }),
);

devDataSourceRouter.get(
  '/:id/tables',
  hasPerm('dev_ds:list'),
  asyncHandler(async (req, res) => {
    res.json(await getDataSourceTablesController(req));
  }),
);

devDataSourceRouter.post(
  '/:id/sync-tables',
  hasAnyPerm(['dev_ds:test', 'dev_form:update', 'dev_model:create']),
  asyncHandler(async (req, res) => {
    res.json(await syncDataSourceTablesController(req));
  }),
);
