import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/async-handler';
import { deleteFileController, listFilesController } from './file.controller';

export const fileRouter = Router();

fileRouter.get(
  '/',
  hasPerm('file:list'),
  asyncHandler(async (req, res) => {
    res.json(await listFilesController(req));
  }),
);

fileRouter.delete(
  '/:id',
  hasPerm('file:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteFileController(req));
  }),
);
