import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/async-handler';
import { serverInfoController } from './monitor.controller';

export const monitorRouter = Router();

monitorRouter.get(
  '/server',
  hasPerm('monitor:server'),
  asyncHandler(async (_req, res) => {
    res.json(await serverInfoController());
  }),
);
