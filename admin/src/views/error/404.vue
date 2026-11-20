<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="error-page">
    <div class="error-page__code">404</div>
    <p class="error-page__text">页面不存在，或菜单组件路径未配置正确</p>
    <div class="error-page__actions">
      <el-button type="primary" @click="router.replace('/')">返回首页</el-button>
      <el-button @click="router.back()">返回上一页</el-button>
    </div>
  </div>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 12px;
}

.error-page__code {
  font-size: 72px;
  font-weight: 800;
  color: #909399;
}

.error-page__text {
  margin: 0;
  font-size: 16px;
  color: #606266;
}

.error-page__actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
</style>
