import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  listConfigsController,
  publicConfigsController,
  updateConfigsController,
} from './config.controller';
import { updateConfigsSchema } from './config.dto';

export const configRouter = Router();

configRouter.get(
  '/',
  hasPerm('system:config'),
  asyncHandler(async (_req, res) => {
    res.json(await listConfigsController());
  }),
);

configRouter.put(
  '/',
  hasPerm('system:config'),
  validateBody(updateConfigsSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateConfigsController(req));
  }),
);

/** 公开只读，仅下发白名单字段，供登录页 / App 使用 */
export const publicConfigRouter = Router();

publicConfigRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await publicConfigsController());
  }),
);
