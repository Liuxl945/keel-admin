import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { AppError, ERROR_CODES } from './app-error';

export type TokenAudience = 'admin' | 'app';
export type TokenType = 'access' | 'refresh';

export interface TokenPayload extends JwtPayload {
  sub: string;
  username: string;
  isSuperAdmin: boolean;
  tokenType: TokenType;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function audienceOf(audience: TokenAudience): string {
  return audience === 'admin' ? config.JWT_ADMIN_AUDIENCE : config.JWT_APP_AUDIENCE;
}

function sign(
  claims: Pick<TokenPayload, 'sub' | 'username' | 'isSuperAdmin'>,
  audience: TokenAudience,
  tokenType: TokenType,
  expiresIn: string,
): string {
  return jwt.sign(
    { ...claims, tokenType },
    config.JWT_SECRET,
    {
      audience: audienceOf(audience),
      // jsonwebtoken 的类型把 expiresIn 收窄成 ms 的 StringValue，这里配置来自环境变量
      expiresIn: expiresIn as SignOptions['expiresIn'],
    },
  );
}

export function issueTokenPair(
  user: { id: number; username: string; isSuperAdmin: boolean },
  audience: TokenAudience,
): TokenPair {
  const claims = {
    sub: String(user.id),
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
  };
  return {
    accessToken: sign(claims, audience, 'access', config.JWT_EXPIRES_IN),
    refreshToken: sign(claims, audience, 'refresh', config.JWT_REFRESH_EXPIRES_IN),
  };
}

/**
 * audience 是隔离 Admin / App 身份的核心：同一套密钥签出的令牌不能跨端使用。
 */
export function verifyToken(
  token: string,
  audience: TokenAudience,
  expectedType: TokenType,
): TokenPayload {
  let payload: JwtPayload | string;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { audience: audienceOf(audience) });
  } catch (error) {
    // audience 不匹配说明拿的是另一端的令牌，单独给 40302 便于前端区分
    if (error instanceof jwt.JsonWebTokenError && /audience/i.test(error.message)) {
      throw new AppError(ERROR_CODES.AUDIENCE_MISMATCH, '登录凭证不适用于当前端，请重新登录');
    }
    throw new AppError(
      expectedType === 'refresh' ? ERROR_CODES.REFRESH_TOKEN_INVALID : ERROR_CODES.UNAUTHORIZED,
      expectedType === 'refresh' ? '刷新令牌无效或已过期，请重新登录' : '登录已过期，请重新登录',
    );
  }

  if (typeof payload === 'string' || payload.tokenType !== expectedType) {
    throw new AppError(
      expectedType === 'refresh' ? ERROR_CODES.REFRESH_TOKEN_INVALID : ERROR_CODES.UNAUTHORIZED,
      expectedType === 'refresh' ? '刷新令牌无效' : '登录凭证无效',
    );
  }

  return payload as TokenPayload;
}
