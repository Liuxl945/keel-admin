import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getPublicConfigs } from '@/api/auth';

export const useAppStore = defineStore('app', () => {
  const systemName = ref('客户端基座');
  const systemLogo = ref('');
  const loginNotice = ref('');
  const loaded = ref(false);

  async function load(): Promise<void> {
    if (loaded.value) return;
    try {
      const configs = await getPublicConfigs();
      systemName.value = configs.system_name || systemName.value;
      systemLogo.value = configs.system_logo || '';
      loginNotice.value = configs.login_notice || '';
    } catch {
      // 公开配置失败不阻断登录流程
    } finally {
      loaded.value = true;
    }
  }

  return { systemName, systemLogo, loginNotice, loaded, load };
});
