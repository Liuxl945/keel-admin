<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { appLogin } from '@/api/auth';
import AppModal from '@/components/app-modal.vue';
import AppToast from '@/components/app-toast.vue';
import { useAppStore } from '@/stores/app';
import { useUserStore } from '@/stores/user';
import { showModal } from '@/utils/modal';
import { toast } from '@/utils/toast';

const app = useAppStore();
const user = useUserStore();
const loading = ref(false);

function getLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.login({
      provider: 'weixin',
      success: (result) => {
        if (result.code) resolve(result.code);
        else reject(new Error('未获取到微信登录凭证，请重试'));
      },
      fail: () => reject(new Error('微信登录失败，请重试')),
    });
    // #endif
    // #ifndef MP-WEIXIN
    // H5 仅用于本地调试，配合后端 WECHAT_MOCK=true
    resolve('h5_dev_code');
    // #endif
  });
}

async function handleLogin(): Promise<void> {
  if (loading.value) return;
  loading.value = true;

  try {
    const code = await getLoginCode();
    const result = await appLogin(code);
    user.setSession(result);
    await user.fetchMe().catch(() => undefined);
    toast.success('登录成功');
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/index/index' });
    }, 500);
  } catch (error) {
    await showModal.alert(error instanceof Error ? error.message : '登录失败，请重试', '登录失败');
  } finally {
    loading.value = false;
  }
}

onShow(() => {
  void app.load();
});
</script>

<template>
  <view class="app-page login">
    <view class="login__brand">
      <image v-if="app.systemLogo" :src="app.systemLogo" class="login__logo" mode="aspectFit" />
      <text class="app-title login__title">{{ app.systemName }}</text>
      <text class="app-subtitle">一次登录，后续自动续期</text>
    </view>

    <view class="app-card login__card">
      <view class="app-list">
        <view class="app-list__item">
          <view class="app-dot" />
          <text>微信一键登录，无需记忆密码</text>
        </view>
        <view class="app-list__item">
          <view class="app-dot" />
          <text>登录状态自动刷新，不打断使用</text>
        </view>
      </view>

      <button class="app-btn login__btn" :loading="loading" :disabled="loading" @click="handleLogin">
        {{ loading ? '登录中…' : '微信一键登录' }}
      </button>

      <text v-if="app.loginNotice" class="login__notice">{{ app.loginNotice }}</text>
    </view>

    <!-- #ifdef H5 -->
    <text class="login__hint">当前为 H5 调试环境，正式使用请打开微信小程序</text>
    <!-- #endif -->

    <AppToast />
    <AppModal />
  </view>
</template>

<style scoped lang="scss">
.login {
  display: flex;
  flex-direction: column;
  gap: 40rpx;
  justify-content: center;
}

.login__brand {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  align-items: center;
  padding: 40rpx 0;
}

.login__logo {
  width: 140rpx;
  height: 140rpx;
  border-radius: 24rpx;
}

.login__title {
  text-align: center;
}

.login__card {
  display: flex;
  flex-direction: column;
  gap: 36rpx;
}

.login__btn {
  width: 100%;
}

.login__notice {
  font-size: 30rpx;
  line-height: 1.6;
  color: var(--app-text-secondary);
  text-align: center;
}

.login__hint {
  font-size: 28rpx;
  color: var(--app-text-secondary);
  text-align: center;
}
</style>
