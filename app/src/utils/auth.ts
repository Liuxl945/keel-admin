const ACCESS_TOKEN_KEY = 'app_access_token';
const REFRESH_TOKEN_KEY = 'app_refresh_token';

export function getAccessToken(): string {
  return (uni.getStorageSync(ACCESS_TOKEN_KEY) as string) || '';
}

export function getRefreshToken(): string {
  return (uni.getStorageSync(REFRESH_TOKEN_KEY) as string) || '';
}

export function setTokens(accessToken: string, refreshToken: string): void {
  uni.setStorageSync(ACCESS_TOKEN_KEY, accessToken);
  uni.setStorageSync(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  uni.removeStorageSync(ACCESS_TOKEN_KEY);
  uni.removeStorageSync(REFRESH_TOKEN_KEY);
}
