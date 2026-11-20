import { Router } from 'express';
import { hasAnyPerm } from '../../middlewares/auth';
import { validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  getSyncedTableController,
  listSyncedTablesController,
  syncTablesController,
} from './dev-db-table.controller';
import { syncedTableQuerySchema } from './dev-db-table.dto';

export const devDbTableRouter = Router();

devDbTableRouter.get(
  '/',
  hasAnyPerm(['dev_model:list', 'dev_form:list', 'dev_ds:list']),
  validateQuery(syncedTableQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listSyncedTablesController(req));
  }),
);

devDbTableRouter.post(
  '/sync/:connectionId',
  hasAnyPerm(['dev_model:list', 'dev_form:update', 'dev_ds:test']),
  asyncHandler(async (req, res) => {
    res.json(await syncTablesController(req));
  }),
);

devDbTableRouter.get(
  '/:id',
  hasAnyPerm(['dev_model:list', 'dev_form:list', 'dev_ds:list']),
  asyncHandler(async (req, res) => {
    res.json(await getSyncedTableController(req));
  }),
);
