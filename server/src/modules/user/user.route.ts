import { Router } from 'express';
import multer from 'multer';
import { hasPerm } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import {
  assignRolesController,
  createUserController,
  deleteUserController,
  downloadUserTemplateController,
  exportUsersController,
  getUserController,
  importUsersController,
  listUsersController,
  resetPasswordController,
  updateStatusController,
  updateUserController,
} from './user.controller';
import {
  assignRolesSchema,
  createUserSchema,
  resetPasswordSchema,
  updateStatusSchema,
  updateUserSchema,
  userQuerySchema,
} from './user.dto';

export const userRouter = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

userRouter.get(
  '/',
  hasPerm('user:list'),
  validateQuery(userQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await listUsersController(req));
  }),
);

userRouter.post(
  '/',
  hasPerm('user:create'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await createUserController(req));
  }),
);

/* 导出/导入必须注册在 /:id 之前，否则 export 会被当成 id */
userRouter.get(
  '/export',
  hasPerm('user:export'),
  asyncHandler(async (req, res) => {
    await exportUsersController(req, res);
  }),
);

userRouter.get(
  '/import-template',
  hasPerm('user:import'),
  asyncHandler(async (req, res) => {
    await downloadUserTemplateController(req, res);
  }),
);

userRouter.post(
  '/import',
  hasPerm('user:import'),
  importUpload.single('file'),
  asyncHandler(async (req, res) => {
    res.json(await importUsersController(req));
  }),
);

userRouter.get(
  '/:id',
  hasPerm('user:detail'),
  asyncHandler(async (req, res) => {
    res.json(await getUserController(req));
  }),
);

userRouter.put(
  '/:id',
  hasPerm('user:update'),
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUserController(req));
  }),
);

userRouter.delete(
  '/:id',
  hasPerm('user:delete'),
  asyncHandler(async (req, res) => {
    res.json(await deleteUserController(req));
  }),
);

userRouter.put(
  '/:id/roles',
  hasPerm('user:assign'),
  validateBody(assignRolesSchema),
  asyncHandler(async (req, res) => {
    res.json(await assignRolesController(req));
  }),
);

userRouter.put(
  '/:id/password',
  hasPerm('user:reset'),
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    res.json(await resetPasswordController(req));
  }),
);

userRouter.put(
  '/:id/status',
  hasPerm('user:update'),
  validateBody(updateStatusSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateStatusController(req));
  }),
);
