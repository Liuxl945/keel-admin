<script setup lang="ts">
defineOptions({ name: 'Dashboard' });

import { computed } from 'vue';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';

const user = useUserStore();

const roleNames = computed(() => user.profile?.roles.map((role) => role.name).join('、') || '未分配角色');

const cards = computed(() => [
  { label: '当前账号', value: user.profile?.username || '-', hint: user.profile?.isSuperAdmin ? '超级管理员' : roleNames.value },
  { label: '可见菜单', value: String(user.menus.length), hint: '由后端菜单树下发' },
  { label: '权限标识', value: String(user.permissions.length), hint: '按钮级 v-permission 使用' },
  { label: '登录时间', value: formatDateTime(user.profile?.lastLoginAt), hint: '本次会话开始前' },
]);
</script>

<template>
  <div class="dashboard">
    <div class="dashboard__hero">
      <div>
        <h2 class="dashboard__title">欢迎回来，{{ user.profile?.nickname || user.profile?.username }}</h2>
        <p class="dashboard__subtitle">这是基础框架首页，替换成业务看板即可。</p>
      </div>
      <el-tag type="success" size="large">框架运行中</el-tag>
    </div>

    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.label" :xs="24" :sm="12" :md="6">
        <div class="stat-card">
          <div class="stat-card__label">{{ card.label }}</div>
          <div class="stat-card__value">{{ card.value }}</div>
          <div class="stat-card__hint">{{ card.hint }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="dashboard__panel">
      <h3 class="dashboard__panel-title">基座已提供</h3>
      <ul class="dashboard__list">
        <li>JWT 双 audience 认证，accessToken / refreshToken 静默续期</li>
        <li>登录图形验证码，一次性校验并计入失败限流</li>
        <li>RBAC：用户、角色、菜单、权限标识，菜单由后端动态下发</li>
        <li>统一响应与错误码、zod 参数校验、分页共享 schema</li>
        <li>写操作审计日志、登录日志、敏感字段脱敏与截断</li>
        <li>系统配置热更新、文件上传 StorageProvider 抽象</li>
        <li>字典管理 + DictTag、通知公告、文件管理、Excel 导入导出</li>
        <li>个人中心、服务监控、多页签、主题色与深色模式</li>
        <li>在线开发：表单三步设计（关联表/字段映射/列表配置）+ CRUD 代码</li>
        <li>数据连接与数据建模：库表自动同步、MySQL/PostgreSQL 建表 + CRUD 代码</li>
        <li>ProTable / AppDialog / datetime 统一时间格式化</li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  background: linear-gradient(120deg, #1f3a5f, #3f7fbf);
  border-radius: 10px;
  color: #fff;
}

.dashboard__title {
  margin: 0;
  font-size: 22px;
}

.dashboard__subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  opacity: 0.82;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: #fff;
  border-radius: 10px;
}

.stat-card__label {
  font-size: 14px;
  color: #909399;
}

.stat-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #1f2d3d;
}

.stat-card__hint {
  font-size: 12px;
  color: #b1b3b8;
}

.dashboard__panel {
  padding: 24px;
  background: #fff;
  border-radius: 10px;
}

.dashboard__panel-title {
  margin: 0 0 12px;
  font-size: 17px;
}

.dashboard__list {
  margin: 0;
  padding-left: 20px;
  line-height: 2;
  color: #606266;
}

.dashboard__tips {
  margin: 16px 0 0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
  background: #f5f7fa;
  border-radius: 6px;
}

.dashboard__tips code {
  padding: 0 4px;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 3px;
}
</style>
