<script setup lang="ts">
import { toastState, type ToastType } from '@/utils/toast';

const icons: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: 'i',
  loading: '…',
};
</script>

<template>
  <view v-if="toastState.visible" class="app-toast" :class="`app-toast--${toastState.type}`">
    <text class="app-toast__icon">{{ icons[toastState.type] }}</text>
    <text class="app-toast__text">{{ toastState.message }}</text>
  </view>
</template>

<style scoped lang="scss">
.app-toast {
  position: fixed;
  top: 120rpx;
  left: 50%;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 16rpx;
  max-width: 80vw;
  padding: 24rpx 32rpx;
  color: #fff;
  background: rgba(31, 45, 61, 0.92);
  border-radius: 16rpx;
  transform: translateX(-50%);
  pointer-events: none;
}

.app-toast__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  font-size: 28rpx;
  font-weight: 700;
  border: 2rpx solid #fff;
  border-radius: 50%;
}

.app-toast__text {
  font-size: 32rpx;
  line-height: 1.5;
}

.app-toast--success .app-toast__icon {
  color: #7ee787;
  border-color: #7ee787;
}

.app-toast--error .app-toast__icon {
  color: #ff8a80;
  border-color: #ff8a80;
}
</style>
