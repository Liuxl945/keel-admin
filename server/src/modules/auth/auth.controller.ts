import type { Request } from 'express';
import { ok } from '../../utils/response';
import { toUserProfile } from '../user/user.mapper';
import { collectMenus } from './permission.service';
import {
  adminLogin,
  appLogin,
  refreshAdmin,
  refreshApp,
  toMemberProfile,
  type ClientMeta,
} from './auth.service';

function clientMeta(req: Request): ClientMeta {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

export async function adminLoginController(req: Request) {
  const { username, password, captchaId, captchaCode } = req.body as {
    username: string;
    password: string;
    captchaId: string;
    captchaCode: string;
  };
  const result = await adminLogin(username, password, captchaId, captchaCode, clientMeta(req));
  return ok(result);
}

export async function adminRefreshController(req: Request) {
  const { refreshToken } = req.body as { refreshToken: string };
  return ok(await refreshAdmin(refreshToken));
}

export function adminMeController(req: Request) {
  return ok(toUserProfile(req.authUser!));
}

export async function adminMenusController(req: Request) {
  return ok(await collectMenus(req.authUser!));
}

export function adminPermissionsController(req: Request) {
  return ok(req.permissions ?? []);
}

export async function appLoginController(req: Request) {
  const { code } = req.body as { code: string };
  return ok(await appLogin(code, clientMeta(req)));
}

export async function appRefreshController(req: Request) {
  const { refreshToken } = req.body as { refreshToken: string };
  return ok(await refreshApp(refreshToken));
}

export function appMeController(req: Request) {
  return ok(toMemberProfile(req.appMember!));
}
