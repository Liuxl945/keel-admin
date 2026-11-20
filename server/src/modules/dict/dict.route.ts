import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createDictDataController,
  createDictTypeController,
  deleteDictDataController,
  deleteDictTypeController,
  dictOptionsController,
  listDictDataController,
  listDictTypeOptionsController,
  listDictTypesController,
  updateDictDataController,
  updateDictTypeController,
} from './dict.controller';
import {
  createDictDataSchema,
  createDictTypeSchema,
  dictDataQuerySchema,
  dictTypeQuerySchema,
  updateDictDataSchema,
  updateDictTypeSchema,
} from './dict.dto';

export const dictRouter = Router();

/** 所有登录用户都需要字典做标签展示，这里只要求登录（authRequired 已在 adminRouter 全局挂载） */
dictRouter.get(
  '/options',
  asyncHandler(async (_req, res) => {
    res.json(await dictOptionsController());
  }),
);

dictRouter.get(
  '/types',
  hasPerm('dict:list'),
  validateQuery(dictTypeQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listDictTypesController(req));
  }),
);

dictRouter.get(
  '/types/options',
  hasPerm('dict:list'),
  asyncHandler(async (_req, res) => {
    res.json(await listDictTypeOptionsController());
  }),
);

dictRouter.post(
  '/types',
  hasPerm('dict:create'),
  validateBody(createDictTypeSchema),
  asyncHandler(async (req, res) => {
    res.json(await createDictTypeController(req));
  }),
);

dictRouter.put(
  '/types/:id',
  hasPerm('dict:update'),
  validateBody(updateDictTypeSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDictTypeController(req));
  }),
);

dictRouter.delete(
  '/types/:id',
  hasPerm('dict:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteDictTypeController(req));
  }),
);

dictRouter.get(
  '/data',
  hasPerm('dict:list'),
  validateQuery(dictDataQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listDictDataController(req));
  }),
);

dictRouter.post(
  '/data',
  hasPerm('dict:create'),
  validateBody(createDictDataSchema),
  asyncHandler(async (req, res) => {
    res.json(await createDictDataController(req));
  }),
);

dictRouter.put(
  '/data/:id',
  hasPerm('dict:update'),
  validateBody(updateDictDataSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDictDataController(req));
  }),
);

dictRouter.delete(
  '/data/:id',
  hasPerm('dict:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteDictDataController(req));
  }),
);
