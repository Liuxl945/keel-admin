<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import AppModal from '@/components/app-modal.vue';
import AppToast from '@/components/app-toast.vue';
import { useAppStore } from '@/stores/app';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';
import { showModal } from '@/utils/modal';
import { toast } from '@/utils/toast';

const app = useAppStore();
const user = useUserStore();
const loading = ref(false);

const features = [
  '微信 code2session 登录，openid 不落前端',
  'accessToken / refreshToken 静默续期',
  '统一响应信封与错误提示',
  'toast / modal 全局单例组件',
  '适老化字号与触控尺寸变量',
];

onShow(async () => {
  void app.load();

  if (!user.isLoggedIn()) {
    uni.reLaunch({ url: '/pages/login/login' });
    return;
  }

  if (user.profile) return;
  loading.value = true;
  try {
    await user.fetchMe();
  } catch (error) {
    if (!user.isLoggedIn()) return;
    await showModal.alert(error instanceof Error ? error.message : '加载用户信息失败', '加载失败');
  } finally {
    loading.value = false;
  }
});

async function handleLogout(): Promise<void> {
  const result = await showModal.confirm('退出后需要重新登录才能继续使用。', '退出登录', {
    tone: 'danger',
    confirmText: '退出登录',
  });
  if (!result.confirm) return;

  user.clearSession();
  toast.success('已退出登录');
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/login' });
  }, 300);
}
</script>

<template>
  <view class="app-page home">
    <view class="app-card profile">
      <image v-if="user.profile?.avatar" :src="user.profile.avatar" class="profile__avatar" mode="aspectFill" />
      <view v-else class="profile__avatar profile__avatar--empty">我</view>
      <view class="profile__info">
        <text class="app-title">{{ user.profile?.nickname || '加载中…' }}</text>
        <text class="app-subtitle">用户编号：{{ user.profile?.id ?? '-' }}</text>
        <text class="app-subtitle">注册时间：{{ formatDateTime(user.profile?.createdAt) }}</text>
      </view>
    </view>

    <view class="app-card">
      <text class="home__section-title">基座已提供</text>
      <view class="app-list home__features">
        <view v-for="item in features" :key="item" class="app-list__item">
          <view class="app-dot" />
          <text>{{ item }}</text>
        </view>
      </view>
    </view>

    <view class="home__tip">
      <text>业务页面请在 src/pages 下新增，并在 pages.json 注册。</text>
    </view>

    <button class="app-btn app-btn--ghost" @click="handleLogout">退出登录</button>

    <AppToast />
    <AppModal />
  </view>
</template>

<style scoped lang="scss">
.home {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
}

.profile {
  display: flex;
  gap: 24rpx;
  align-items: center;
}

.profile__avatar {
  flex: none;
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
}

.profile__avatar--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
  background: var(--app-primary);
}

.profile__info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.home__section-title {
  display: block;
  margin-bottom: 20rpx;
  font-size: 36rpx;
  font-weight: 700;
}

.home__features {
  gap: 12rpx;
}

.home__tip {
  padding: 24rpx 28rpx;
  font-size: 30rpx;
  line-height: 1.7;
  color: var(--app-text-secondary);
  background: #ecf5ff;
  border-radius: 16rpx;
}
</style>
