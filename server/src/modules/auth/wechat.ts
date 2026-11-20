import crypto from 'node:crypto';
import { config } from '../../config';
import { AppError, ERROR_CODES } from '../../utils/app-error';

export interface WechatSession {
  openid: string;
  unionid: string | null;
}

interface WechatSessionResponse {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * openid 只能由服务端用 code 换取，前端传 openid 的登录方式一律不接受。
 * 本地开发用 WECHAT_MOCK 走确定性模拟 openid，方便联调。
 */
export async function code2Session(code: string): Promise<WechatSession> {
  if (config.WECHAT_MOCK) {
    const openid = `mock_${crypto.createHash('sha256').update(code).digest('hex').slice(0, 24)}`;
    return { openid, unionid: null };
  }

  if (!config.WECHAT_APPID || !config.WECHAT_SECRET) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '服务端未配置微信登录参数');
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.WECHAT_APPID);
  url.searchParams.set('secret', config.WECHAT_SECRET);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  let data: WechatSessionResponse;
  try {
    const response = await fetch(url);
    data = (await response.json()) as WechatSessionResponse;
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '微信登录服务暂时不可用，请稍后重试');
  }

  if (data.errcode || !data.openid) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `微信登录失败：${data.errmsg ?? '无效的 code'}`);
  }

  return { openid: data.openid, unionid: data.unionid ?? null };
}
