import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createMenuController,
  deleteMenuController,
  getMenuController,
  listMenusController,
  updateMenuController,
} from './menu.controller';
import { createMenuSchema, updateMenuSchema } from './menu.dto';

export const menuRouter = Router();

menuRouter.get(
  '/',
  hasPerm('menu:list'),
  asyncHandler(async (_req, res) => {
    res.json(await listMenusController());
  }),
);

menuRouter.post(
  '/',
  hasPerm('menu:create'),
  validateBody(createMenuSchema),
  asyncHandler(async (req, res) => {
    res.json(await createMenuController(req));
  }),
);

menuRouter.get(
  '/:id',
  hasPerm('menu:list'),
  asyncHandler(async (req, res) => {
    res.json(await getMenuController(req));
  }),
);

menuRouter.put(
  '/:id',
  hasPerm('menu:update'),
  validateBody(updateMenuSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateMenuController(req));
  }),
);

menuRouter.delete(
  '/:id',
  hasPerm('menu:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteMenuController(req));
  }),
);
