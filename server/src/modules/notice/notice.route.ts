import { Router } from 'express';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createNoticeController,
  deleteNoticeController,
  getNoticeController,
  listNoticesController,
  updateNoticeController,
  updateNoticeStatusController,
} from './notice.controller';
import {
  createNoticeSchema,
  noticeQuerySchema,
  updateNoticeSchema,
  updateNoticeStatusSchema,
} from './notice.dto';

export const noticeRouter = Router();

noticeRouter.get(
  '/',
  hasPerm('notice:list'),
  validateQuery(noticeQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listNoticesController(req));
  }),
);

noticeRouter.post(
  '/',
  hasPerm('notice:create'),
  validateBody(createNoticeSchema),
  asyncHandler(async (req, res) => {
    res.json(await createNoticeController(req));
  }),
);

noticeRouter.get(
  '/:id',
  hasPerm('notice:list'),
  asyncHandler(async (req, res) => {
    res.json(await getNoticeController(req));
  }),
);

noticeRouter.put(
  '/:id',
  hasPerm('notice:update'),
  validateBody(updateNoticeSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateNoticeController(req));
  }),
);

noticeRouter.put(
  '/:id/status',
  hasPerm('notice:update'),
  validateBody(updateNoticeStatusSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateNoticeStatusController(req));
  }),
);

noticeRouter.delete(
  '/:id',
  hasPerm('notice:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteNoticeController(req));
  }),
);
