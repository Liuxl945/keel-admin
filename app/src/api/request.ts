import type { ApiEnvelope } from '@/types/api';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/auth';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  data?: Record<string, unknown>;
  /** 公开接口不需要带 token */
  auth?: boolean;
  _skipRefresh?: boolean;
  _retry?: boolean;
}

let refreshPromise: Promise<string> | null = null;

function send<T>(path: string, options: RequestOptions): Promise<ApiEnvelope<T>> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseURL}${path}`,
      method: options.method ?? 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...(options.auth === false ? {} : { Authorization: `Bearer ${getAccessToken()}` }),
      },
      success: (response) => {
        resolve(response.data as ApiEnvelope<T>);
      },
      fail: () => {
        reject(new Error('网络异常，请检查网络后重试'));
      },
    });
  });
}

function isAuthError(code: number): boolean {
  return code >= 40100 && code < 40200;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('缺少刷新令牌');

  const body = await send<{ accessToken: string; refreshToken: string }>('/auth/app/refresh', {
    method: 'POST',
    data: { refreshToken },
    auth: false,
    _skipRefresh: true,
  });

  if (body.code !== 0 || !body.data) throw new Error(body.message || '刷新登录状态失败');
  setTokens(body.data.accessToken, body.data.refreshToken);
  return body.data.accessToken;
}

/** 单例 refreshPromise：并发 401 只刷新一次 */
function ensureRefreshed(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function redirectToLogin(): void {
  clearTokens();
  uni.reLaunch({ url: '/pages/login/login' });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = await send<T>(path, options);

  if (body.code === 0) {
    return body.data as T;
  }

  if (isAuthError(body.code) && !options._skipRefresh) {
    if (options._retry) {
      redirectToLogin();
      throw new Error(body.message || '登录已过期，请重新登录');
    }
    try {
      await ensureRefreshed();
      return request<T>(path, { ...options, _retry: true });
    } catch {
      redirectToLogin();
      throw new Error('登录已过期，请重新登录');
    }
  }

  throw new Error(body.message || '请求失败');
}
