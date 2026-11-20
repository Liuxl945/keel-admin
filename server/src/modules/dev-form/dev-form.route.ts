import { Router } from 'express';
import { hasAnyPerm, hasFormPerm, hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  createDevFormController,
  deleteDevFormController,
  downloadDevFormCodeController,
  ensureDevFormMenuController,
  generateDevFormMenuController,
  getDevFormCodeController,
  getDevFormController,
  listDevFormsController,
  previewDevFormCreateController,
  previewDevFormDeleteController,
  previewDevFormDetailsController,
  previewDevFormListController,
  previewDevFormUpdateController,
  publishDevFormController,
  updateDevFormController,
} from './dev-form.controller';
import {
  createDevFormSchema,
  devFormQuerySchema,
  generateFormMenuSchema,
  updateDevFormSchema,
} from './dev-form.dto';

export const devFormRouter = Router();

devFormRouter.get(
  '/',
  hasPerm('dev_form:list'),
  validateQuery(devFormQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listDevFormsController(req));
  }),
);

devFormRouter.post(
  '/',
  hasPerm('dev_form:create'),
  validateBody(createDevFormSchema),
  asyncHandler(async (req, res) => {
    res.json(await createDevFormController(req));
  }),
);

devFormRouter.get(
  '/:id/code',
  hasPerm('dev_form:list'),
  asyncHandler(async (req, res) => {
    res.json(await getDevFormCodeController(req));
  }),
);

devFormRouter.get(
  '/:id/code/zip',
  hasPerm('dev_form:list'),
  asyncHandler(async (req, res) => {
    await downloadDevFormCodeController(req, res);
  }),
);

devFormRouter.get(
  '/:id/preview',
  hasFormPerm('list'),
  asyncHandler(async (req, res) => {
    res.json(await previewDevFormListController(req));
  }),
);

devFormRouter.get(
  '/:id/preview/:rowId/details',
  hasFormPerm('list'),
  asyncHandler(async (req, res) => {
    res.json(await previewDevFormDetailsController(req));
  }),
);

devFormRouter.post(
  '/:id/preview',
  hasFormPerm('create'),
  asyncHandler(async (req, res) => {
    res.json(await previewDevFormCreateController(req));
  }),
);

devFormRouter.put(
  '/:id/preview/:rowId',
  hasFormPerm('update'),
  asyncHandler(async (req, res) => {
    res.json(await previewDevFormUpdateController(req));
  }),
);

devFormRouter.delete(
  '/:id/preview/:rowId',
  hasFormPerm('delete'),
  asyncHandler(async (req, res) => {
    res.json(await previewDevFormDeleteController(req));
  }),
);

// 生成页菜单（指向下载的 biz/<key>/index），幂等；下载代码前调用
devFormRouter.post(
  '/:id/menu/ensure',
  hasAnyPerm(['dev_form:publish', 'menu:create']),
  validateBody(generateFormMenuSchema),
  asyncHandler(async (req, res) => {
    res.json(await ensureDevFormMenuController(req));
  }),
);

// 生成业务菜单 + 权限点，publish 与菜单管理任一权限即可
devFormRouter.post(
  '/:id/menu',
  hasAnyPerm(['dev_form:publish', 'menu:create']),
  validateBody(generateFormMenuSchema),
  asyncHandler(async (req, res) => {
    res.json(await generateDevFormMenuController(req));
  }),
);

devFormRouter.post(
  '/:id/publish',
  hasPerm('dev_form:publish'),
  asyncHandler(async (req, res) => {
    res.json(await publishDevFormController(req));
  }),
);

devFormRouter.get(
  '/:id',
  hasFormPerm('list'),
  asyncHandler(async (req, res) => {
    res.json(await getDevFormController(req));
  }),
);

devFormRouter.put(
  '/:id',
  hasPerm('dev_form:update'),
  validateBody(updateDevFormSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateDevFormController(req));
  }),
);

devFormRouter.delete(
  '/:id',
  hasPerm('dev_form:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteDevFormController(req));
  }),
);
