import { Router } from 'express';
import { appAuthRequired, authRequired } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/async-handler';
import { ok } from '../../utils/response';
import {
  adminLoginController,
  adminMeController,
  adminMenusController,
  adminPermissionsController,
  adminRefreshController,
  appLoginController,
  appMeController,
  appRefreshController,
} from './auth.controller';
import { adminLoginSchema, appLoginSchema, refreshSchema } from './auth.dto';

export const authRouter = Router();

authRouter.post(
  '/admin/login',
  validateBody(adminLoginSchema),
  asyncHandler(async (req, res) => {
    res.json(await adminLoginController(req));
  }),
);

authRouter.post(
  '/admin/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    res.json(await adminRefreshController(req));
  }),
);

authRouter.post(
  '/admin/logout',
  authRequired,
  asyncHandler(async (_req, res) => {
    // JWT 无状态，登出由前端清 token；这里保留接口便于以后做黑名单/审计
    res.json(ok(null, '已退出登录'));
  }),
);

authRouter.get(
  '/admin/me',
  authRequired,
  asyncHandler(async (req, res) => {
    res.json(adminMeController(req));
  }),
);

authRouter.get(
  '/admin/me/menus',
  authRequired,
  asyncHandler(async (req, res) => {
    res.json(await adminMenusController(req));
  }),
);

authRouter.get(
  '/admin/me/permissions',
  authRequired,
  asyncHandler(async (req, res) => {
    res.json(adminPermissionsController(req));
  }),
);

authRouter.post(
  '/app/login',
  validateBody(appLoginSchema),
  asyncHandler(async (req, res) => {
    res.json(await appLoginController(req));
  }),
);

authRouter.post(
  '/app/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    res.json(await appRefreshController(req));
  }),
);

authRouter.get(
  '/app/me',
  appAuthRequired,
  asyncHandler(async (req, res) => {
    res.json(appMeController(req));
  }),
);
