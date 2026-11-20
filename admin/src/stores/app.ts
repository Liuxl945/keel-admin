import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getPublicConfigs } from '@/api/auth';

export const useAppStore = defineStore('app', () => {
  const systemName = ref('Keel（龙骨）');
  const systemLogo = ref('');
  const loginNotice = ref('');
  const loaded = ref(false);

  async function loadPublicConfigs(): Promise<void> {
    if (loaded.value) return;
    try {
      const configs = await getPublicConfigs();
      systemName.value = configs.system_name || systemName.value;
      systemLogo.value = configs.system_logo || '';
      loginNotice.value = configs.login_notice || '';
    } catch {
      // 公开配置失败不影响登录，保留默认文案
    } finally {
      loaded.value = true;
    }
  }

  return { systemName, systemLogo, loginNotice, loaded, loadPublicConfigs };
});
