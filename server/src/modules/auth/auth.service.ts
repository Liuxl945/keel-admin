import { AppDataSource } from '../../db/data-source';
import { Member, SysUser } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { issueTokenPair, verifyToken } from '../../utils/jwt';
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from '../../utils/login-rate-limit';
import { verifyPassword } from '../../utils/password';
import { verifyCaptcha } from '../captcha/captcha.service';
import { createLoginLog } from '../log/log.service';
import { toUserProfile } from '../user/user.mapper';
import { code2Session } from './wechat';

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

function userRepo() {
  return AppDataSource.getRepository(SysUser);
}

function memberRepo() {
  return AppDataSource.getRepository(Member);
}

function rateKey(username: string, meta: ClientMeta): string {
  return `${username}:${meta.ip ?? 'unknown'}`;
}

export async function adminLogin(
  username: string,
  password: string,
  captchaId: string,
  captchaCode: string,
  meta: ClientMeta,
) {
  const key = rateKey(username, meta);
  assertLoginAllowed(key);

  try {
    verifyCaptcha(captchaId, captchaCode);
  } catch (error) {
    // 验证码错误同样计入失败次数，避免绕过限流反复尝试
    recordLoginFailure(key);
    await createLoginLog({
      user_id: null,
      username,
      user_type: 'ADMIN',
      success: false,
      message: '验证码错误或已过期',
      ...meta,
    });
    throw error;
  }

  const user = await userRepo()
    .createQueryBuilder('user')
    .addSelect('user.password_hash')
    .leftJoinAndSelect('user.roles', 'role')
    .where('user.username = :username', { username })
    .getOne();

  if (!user) {
    recordLoginFailure(key);
    await createLoginLog({
      user_id: null,
      username,
      user_type: 'ADMIN',
      success: false,
      message: '账号不存在',
      ...meta,
    });
    throw new AppError(ERROR_CODES.LOGIN_FAILED, '账号或密码错误');
  }

  const passwordMatched = await verifyPassword(password, user.password_hash);
  if (!passwordMatched) {
    recordLoginFailure(key);
    await createLoginLog({
      user_id: user.id,
      username,
      user_type: 'ADMIN',
      success: false,
      message: '密码错误',
      ...meta,
    });
    throw new AppError(ERROR_CODES.LOGIN_FAILED, '账号或密码错误');
  }

  if (user.status !== 'ENABLED') {
    await createLoginLog({
      user_id: user.id,
      username,
      user_type: 'ADMIN',
      success: false,
      message: '账号已禁用',
      ...meta,
    });
    throw new AppError(ERROR_CODES.ACCOUNT_DISABLED_FORBIDDEN, '账号已被禁用');
  }

  clearLoginFailures(key);
  await userRepo().update(user.id, { last_login_at: new Date() });
  user.last_login_at = new Date();

  await createLoginLog({
    user_id: user.id,
    username,
    user_type: 'ADMIN',
    success: true,
    message: '登录成功',
    ...meta,
  });

  const tokens = issueTokenPair(
    { id: user.id, username: user.username, isSuperAdmin: user.is_super_admin },
    'admin',
  );
  return { ...tokens, user: toUserProfile(user) };
}

export async function refreshAdmin(refreshToken: string) {
  const payload = verifyToken(refreshToken, 'admin', 'refresh');
  const user = await userRepo().findOneBy({ id: Number(payload.sub) });

  if (!user) throw new AppError(ERROR_CODES.REFRESH_TOKEN_INVALID, '账号不存在，请重新登录');
  if (user.status !== 'ENABLED') {
    throw new AppError(ERROR_CODES.ACCOUNT_DISABLED_FORBIDDEN, '账号已被禁用');
  }

  return issueTokenPair(
    { id: user.id, username: user.username, isSuperAdmin: user.is_super_admin },
    'admin',
  );
}

export async function appLogin(code: string, meta: ClientMeta) {
  const session = await code2Session(code);
  let member = await memberRepo().findOneBy({ openid: session.openid });

  if (!member) {
    member = memberRepo().create({
      openid: session.openid,
      unionid: session.unionid,
      nickname: '微信用户',
      avatar: null,
      phone: null,
      status: 'ENABLED',
      last_login_at: new Date(),
    });
    await memberRepo().save(member);
  } else {
    if (member.status !== 'ENABLED') {
      await createLoginLog({
        user_id: member.id,
        username: member.nickname,
        user_type: 'APP',
        success: false,
        message: '账号已禁用',
        ...meta,
      });
      throw new AppError(ERROR_CODES.ACCOUNT_DISABLED_FORBIDDEN, '账号已被禁用');
    }
    await memberRepo().update(member.id, {
      last_login_at: new Date(),
      unionid: session.unionid ?? member.unionid,
    });
    member.last_login_at = new Date();
  }

  await createLoginLog({
    user_id: member.id,
    username: member.nickname,
    user_type: 'APP',
    success: true,
    message: '微信登录成功',
    ...meta,
  });

  const tokens = issueTokenPair(
    { id: member.id, username: member.nickname, isSuperAdmin: false },
    'app',
  );
  return { ...tokens, user: toMemberProfile(member) };
}

export async function refreshApp(refreshToken: string) {
  const payload = verifyToken(refreshToken, 'app', 'refresh');
  const member = await memberRepo().findOneBy({ id: Number(payload.sub) });

  if (!member) throw new AppError(ERROR_CODES.REFRESH_TOKEN_INVALID, '用户不存在，请重新登录');
  if (member.status !== 'ENABLED') {
    throw new AppError(ERROR_CODES.ACCOUNT_DISABLED_FORBIDDEN, '账号已被禁用');
  }

  return issueTokenPair(
    { id: member.id, username: member.nickname, isSuperAdmin: false },
    'app',
  );
}

export function toMemberProfile(member: Member) {
  return {
    id: member.id,
    nickname: member.nickname,
    avatar: member.avatar,
    phone: member.phone,
    createdAt: member.createdAt,
  };
}
