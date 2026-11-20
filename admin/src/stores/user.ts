import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getMe,
  getMyMenus,
  getMyPermissions,
  login as loginApi,
  logout as logoutApi,
  type LoginPayload,
} from '@/api/auth';
import { useTagsViewStore } from '@/stores/tagsView';
import type { AdminUser, MenuNode } from '@/types/entities';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/utils/auth';

export const useUserStore = defineStore('user', () => {
  const accessToken = ref(getAccessToken());
  const refreshToken = ref(getRefreshToken());
  const profile = ref<AdminUser | null>(null);
  const menus = ref<MenuNode[]>([]);
  const permissions = ref<string[]>([]);
  const profileLoaded = ref(false);

  async function login(payload: LoginPayload): Promise<AdminUser> {
    const result = await loginApi(payload);
    accessToken.value = result.accessToken;
    refreshToken.value = result.refreshToken;
    setTokens(result.accessToken, result.refreshToken);
    return result.user;
  }

  async function fetchProfile(): Promise<void> {
    const [me, menuTree, perms] = await Promise.all([getMe(), getMyMenus(), getMyPermissions()]);
    profile.value = me;
    menus.value = menuTree;
    permissions.value = perms;
    profileLoaded.value = true;
  }

  function hasPermission(perm: string): boolean {
    return Boolean(profile.value?.isSuperAdmin || permissions.value.includes(perm));
  }

  function clearSession(): void {
    clearTokens();
    accessToken.value = '';
    refreshToken.value = '';
    profile.value = null;
    menus.value = [];
    permissions.value = [];
    profileLoaded.value = false;
    useTagsViewStore().reset();
  }

  async function logout(): Promise<void> {
    try {
      await logoutApi();
    } catch {
      // 后端不可达也要清本地状态，否则用户会卡在登录态
    } finally {
      clearSession();
    }
  }

  return {
    accessToken,
    refreshToken,
    profile,
    menus,
    permissions,
    profileLoaded,
    login,
    fetchProfile,
    hasPermission,
    clearSession,
    logout,
  };
});
