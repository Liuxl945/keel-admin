import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAppMe } from '@/api/auth';
import type { AppLoginResult, AppMember } from '@/types/entities';
import { clearTokens, getAccessToken, setTokens } from '@/utils/auth';

export const useUserStore = defineStore('user', () => {
  const token = ref(getAccessToken());
  const profile = ref<AppMember | null>(null);

  function isLoggedIn(): boolean {
    return Boolean(token.value);
  }

  function setSession(result: AppLoginResult): void {
    setTokens(result.accessToken, result.refreshToken);
    token.value = result.accessToken;
    profile.value = result.user;
  }

  async function fetchMe(): Promise<void> {
    profile.value = await getAppMe();
  }

  function clearSession(): void {
    clearTokens();
    token.value = '';
    profile.value = null;
  }

  return { token, profile, isLoggedIn, setSession, fetchMe, clearSession };
});
