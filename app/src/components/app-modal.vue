<script setup lang="ts">
import { modalState, resolveModal } from '@/utils/modal';
</script>

<template>
  <view v-if="modalState.visible" class="app-modal">
    <view class="app-modal__mask" @click="resolveModal(false)" />
    <view class="app-modal__panel">
      <view class="app-modal__title">{{ modalState.title }}</view>
      <text class="app-modal__content">{{ modalState.content }}</text>
      <view class="app-modal__actions">
        <button
          v-if="modalState.showCancel"
          class="app-modal__btn app-modal__btn--cancel"
          @click="resolveModal(false)"
        >
          {{ modalState.cancelText }}
        </button>
        <button
          class="app-modal__btn"
          :class="{ 'app-modal__btn--danger': modalState.tone === 'danger' }"
          @click="resolveModal(true)"
        >
          {{ modalState.confirmText }}
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.app-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}

.app-modal__mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.app-modal__panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 620rpx;
  padding: 40rpx 32rpx 32rpx;
  background: #fff;
  border-radius: 24rpx;
}

.app-modal__title {
  margin-bottom: 20rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #1f2d3d;
  text-align: center;
}

.app-modal__content {
  display: block;
  font-size: 34rpx;
  line-height: 1.7;
  color: #4e5969;
  text-align: center;
  word-break: break-all;
}

.app-modal__actions {
  display: flex;
  gap: 20rpx;
  margin-top: 36rpx;
}

.app-modal__btn {
  flex: 1;
  height: 96rpx;
  margin: 0;
  font-size: 36rpx;
  font-weight: 700;
  line-height: 96rpx;
  color: #fff;
  background: #1f6feb;
  border: none;
  border-radius: 16rpx;
}

.app-modal__btn::after {
  border: none;
}

.app-modal__btn--cancel {
  color: #4e5969;
  background: #f2f3f5;
}

.app-modal__btn--danger {
  background: #c62828;
}
</style>
