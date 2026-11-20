import type { RequestHandler } from 'express';
import { AppDataSource } from '../db/data-source';
import { DevForm, Member } from '../db/entities';
import { collectPermissions, loadAdminUser } from '../modules/auth/permission.service';
import { asyncHandler } from '../utils/async-handler';
import { AppError, ERROR_CODES } from '../utils/app-error';
import { verifyToken } from '../utils/jwt';

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export const authRequired: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw new AppError(ERROR_CODES.UNAUTHORIZED, '未登录或登录已过期');

  const payload = verifyToken(token, 'admin', 'access');
  const userId = Number(payload.sub);
  const user = await loadAdminUser(userId);

  if (!user) throw new AppError(ERROR_CODES.UNAUTHORIZED, '账号不存在或已被删除');
  if (user.status !== 'ENABLED') throw new AppError(ERROR_CODES.ACCOUNT_DISABLED_FORBIDDEN, '账号已被禁用');

  req.auth = {
    userId: user.id,
    username: user.username,
    isSuperAdmin: user.is_super_admin,
    audience: 'admin',
  };
  req.authUser = user;
  req.permissions = await collectPermissions(user);
  next();
});

export function hasPerm(perm: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(ERROR_CODES.UNAUTHORIZED, '未登录或登录已过期'));
      return;
    }
    if (req.auth.isSuperAdmin || req.permissions?.includes(perm)) {
      next();
      return;
    }
    next(new AppError(ERROR_CODES.FORBIDDEN, '无权执行该操作'));
  };
}

/** 跨模块共用接口：满足任一权限即可，例如表单设计器也要读取同步的库表 */
export function hasAnyPerm(perms: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(ERROR_CODES.UNAUTHORIZED, '未登录或登录已过期'));
      return;
    }
    if (
      req.auth.isSuperAdmin ||
      perms.some((perm) => req.permissions?.includes(perm))
    ) {
      next();
      return;
    }
    next(new AppError(ERROR_CODES.FORBIDDEN, '无权执行该操作'));
  };
}

/**
 * 在线表单运行时接口的权限校验：
 * 优先匹配菜单生成时创建的 biz_<form_key>:<action>，
 * 未命中时回落到在线开发模块权限（dev_form:list / dev_form:update）。
 */
export function hasFormPerm(action: 'list' | 'create' | 'update' | 'delete'): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw new AppError(ERROR_CODES.UNAUTHORIZED, '未登录或登录已过期');
    if (req.auth.isSuperAdmin) {
      next();
      return;
    }

    const perms = req.permissions ?? [];
    const formId = Number(req.params.id);
    if (Number.isInteger(formId) && formId > 0) {
      const form = await AppDataSource.getRepository(DevForm).findOne({
        where: { id: formId },
        select: { id: true, form_key: true },
      });
      if (form) {
        const prefix = `biz_${form.form_key}:`;
        const bizPerms = perms.filter((perm) => perm.startsWith(prefix));
        if (bizPerms.includes(`${prefix}${action}`)) {
          next();
          return;
        }
        // 有任一业务权限就能查看列表与详情
        if (action === 'list' && bizPerms.length > 0) {
          next();
          return;
        }
      }
    }

    const legacyPerm = action === 'list' ? 'dev_form:list' : 'dev_form:update';
    if (perms.includes(legacyPerm)) {
      next();
      return;
    }
    throw new AppError(ERROR_CODES.FORBIDDEN, '无权执行该操作');
  });
}

export const appAuthRequired: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw new AppError(ERROR_CODES.UNAUTHORIZED, '未登录或登录已过期');

  const payload = verifyToken(token, 'app', 'access');
  const member = await AppDataSource.getRepository(Member).findOne({
    where: { id: Number(payload.sub) },
  });

  if (!member) throw new AppError(ERROR_CODES.UNAUTHORIZED, '用户不存在或已被删除');
  if (member.status !== 'ENABLED') throw new AppError(ERROR_CODES.ACCOUNT_DISABLED_FORBIDDEN, '账号已被禁用');

  req.auth = {
    userId: member.id,
    username: member.nickname,
    isSuperAdmin: false,
    audience: 'app',
  };
  req.appMember = member;
  next();
});
