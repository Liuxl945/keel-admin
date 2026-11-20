import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiEnvelope } from '@/types/api';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/auth';

export interface RequestConfig extends AxiosRequestConfig {
  /** 登录/刷新接口不参与静默刷新，避免递归 */
  _skipRefresh?: boolean;
  /** 少数公开接口不需要带 token */
  _skipAuth?: boolean;
  /** 静默模式：失败不弹全局提示，由调用方自行处理（如分片上传重试） */
  _silent?: boolean;
  _retry?: boolean;
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const service = axios.create({ baseURL, timeout: 20000 });

let refreshPromise: Promise<string> | null = null;

function isAuthError(code: number): boolean {
  return code >= 40100 && code < 40200;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('缺少刷新令牌');

  const { data } = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
    `${baseURL}/auth/admin/refresh`,
    { refreshToken },
  );
  if (data.code !== 0 || !data.data) throw new Error(data.message || '刷新登录状态失败');

  setTokens(data.data.accessToken, data.data.refreshToken);
  return data.data.accessToken;
}

/** 单例 refreshPromise：并发 401 只触发一次刷新 */
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
  if (window.location.pathname.startsWith('/login')) return;
  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?redirect=${redirect}`;
}

service.interceptors.request.use((config) => {
  const requestConfig = config as typeof config & RequestConfig;
  const token = getAccessToken();
  if (token && !requestConfig._skipAuth) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

service.interceptors.response.use(
  async (response: AxiosResponse): Promise<AxiosResponse> => {
    const body = response.data as ApiEnvelope<unknown>;
    const config = response.config as typeof response.config & RequestConfig;

    // 非信封响应（例如静态文件）直接透传
    if (!body || typeof body.code !== 'number') return response;

    if (body.code === 0) return body.data as unknown as AxiosResponse;

    if (isAuthError(body.code) && !config._skipRefresh) {
      if (config._retry) {
        redirectToLogin();
        return Promise.reject(new Error(body.message));
      }
      config._retry = true;
      try {
        const token = await ensureRefreshed();
        config.headers.Authorization = `Bearer ${token}`;
        return service(config);
      } catch {
        redirectToLogin();
        ElMessage.error('登录已过期，请重新登录');
        return Promise.reject(new Error(body.message));
      }
    }

    if (!config._silent) ElMessage.error(body.message || '请求失败');
    return Promise.reject(new Error(body.message || '请求失败'));
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    const config = error.config as (typeof error.config & RequestConfig) | undefined;
    const message = error.response?.data?.message;
    if (config?._silent) {
      return Promise.reject(error);
    }
    if (error.code === 'ERR_NETWORK') {
      ElMessage.error('网络异常，请确认后端服务已启动');
    } else {
      ElMessage.error(message || '请求失败');
    }
    return Promise.reject(error);
  },
);

export const http = {
  get<T>(url: string, config?: RequestConfig): Promise<T> {
    return service.get(url, config) as unknown as Promise<T>;
  },
  post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return service.post(url, data, config) as unknown as Promise<T>;
  },
  put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return service.put(url, data, config) as unknown as Promise<T>;
  },
  delete<T>(url: string, config?: RequestConfig): Promise<T> {
    return service.delete(url, config) as unknown as Promise<T>;
  },
};

/** 下载二进制文件；失败时后端仍返回 JSON 信封，这里解析成可读错误 */
export async function downloadFile(
  url: string,
  params: Record<string, unknown>,
  fallbackName: string,
): Promise<void> {
  const response = (await service.get(url, {
    params,
    responseType: 'blob',
  })) as unknown as AxiosResponse<Blob>;

  const blob = response.data;
  if (!(blob instanceof Blob)) throw new Error('下载失败');

  if (blob.type.includes('application/json')) {
    const body = JSON.parse(await blob.text()) as ApiEnvelope<unknown>;
    ElMessage.error(body.message || '下载失败');
    throw new Error(body.message || '下载失败');
  }

  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
