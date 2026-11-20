import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  assignMenusController,
  createRoleController,
  deleteRoleController,
  getRoleController,
  listRoleOptionsController,
  listRolesController,
  updateRoleController,
} from './role.controller';
import {
  assignMenusSchema,
  createRoleSchema,
  roleQuerySchema,
  updateRoleSchema,
} from './role.dto';

export const roleRouter = Router();

roleRouter.get(
  '/',
  hasPerm('role:list'),
  validateQuery(roleQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listRolesController(req));
  }),
);

roleRouter.get(
  '/options',
  hasPerm('role:list'),
  asyncHandler(async (_req, res) => {
    res.json(await listRoleOptionsController());
  }),
);

roleRouter.post(
  '/',
  hasPerm('role:create'),
  validateBody(createRoleSchema),
  asyncHandler(async (req, res) => {
    res.json(await createRoleController(req));
  }),
);

roleRouter.get(
  '/:id',
  hasPerm('role:list'),
  asyncHandler(async (req, res) => {
    res.json(await getRoleController(req));
  }),
);

roleRouter.put(
  '/:id',
  hasPerm('role:update'),
  validateBody(updateRoleSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateRoleController(req));
  }),
);

roleRouter.delete(
  '/:id',
  hasPerm('role:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteRoleController(req));
  }),
);

roleRouter.put(
  '/:id/menus',
  hasPerm('role:assign'),
  validateBody(assignMenusSchema),
  asyncHandler(async (req, res) => {
    res.json(await assignMenusController(req));
  }),
);
