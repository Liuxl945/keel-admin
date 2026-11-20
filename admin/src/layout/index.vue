<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAppStore } from '@/stores/app';
import { useSettingsStore } from '@/stores/settings';
import { useTagsViewStore } from '@/stores/tagsView';
import { useUserStore } from '@/stores/user';
import SettingsPanel from './components/SettingsPanel.vue';
import SidebarItem from './components/SidebarItem.vue';
import TagsView from './components/TagsView.vue';

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const app = useAppStore();
const settings = useSettingsStore();
const tagsView = useTagsViewStore();

const collapsed = ref(false);
const fullscreen = ref(false);

/** 只缓存当前打开页签对应的组件，关闭页签会自动释放 */
const cachedViews = computed(() =>
  tagsView.views
    .map((view) => view.cacheName)
    .filter((name): name is string => Boolean(name)),
);

const breadcrumbs = computed(() =>
  route.matched
    .map((item) => item.meta?.title)
    .filter((title): title is string => typeof title === 'string' && title.length > 0),
);

const activeMenu = computed(() =>
  typeof route.meta.activeMenu === 'string' ? route.meta.activeMenu : route.path,
);

async function handleCommand(command: string): Promise<void> {
  if (command === 'profile') {
    await router.push('/profile');
    return;
  }
  if (command !== 'logout') return;
  await user.logout();
  ElMessage.success('已退出登录');
  await router.replace('/login');
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
    return;
  }
  void document.documentElement.requestFullscreen().catch(() => undefined);
}

function handleFullscreenChange(): void {
  fullscreen.value = Boolean(document.fullscreenElement);
}

onMounted(() => {
  void app.loadPublicConfigs();
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
});
</script>

<template>
  <el-container class="layout">
    <el-aside class="layout__aside" :width="collapsed ? '64px' : '220px'">
      <div class="layout__logo" :class="{ 'is-collapsed': collapsed }" @click="router.push('/')">
        <div class="layout__logo-mark">
          <img v-if="app.systemLogo" :src="app.systemLogo" alt="logo" class="layout__logo-img" />
          <span v-else class="layout__logo-mini">{{ app.systemName.slice(0, 1) }}</span>
        </div>
        <div v-if="!collapsed" class="layout__logo-info">
          <span class="layout__logo-text">{{ app.systemName }}</span>
          <span class="layout__logo-sub">ADMIN CONSOLE</span>
        </div>
      </div>

      <el-scrollbar class="layout__menu-scroll">
        <el-menu
          :default-active="activeMenu"
          :collapse="collapsed"
          :collapse-transition="false"
          router
          background-color="#16263a"
          text-color="#aeb9c9"
          active-text-color="#ffffff"
        >
          <SidebarItem v-for="menu in user.menus" :key="menu.id" :item="menu" />
        </el-menu>
      </el-scrollbar>

      <div class="layout__aside-footer">
        <button
          type="button"
          class="layout__collapse-btn"
          :class="{ 'is-collapsed': collapsed }"
          :title="collapsed ? '展开菜单' : '收起菜单'"
          @click="collapsed = !collapsed"
        >
          <el-icon>
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <span v-if="!collapsed">收起菜单</span>
        </button>
      </div>
    </el-aside>

    <el-container class="layout__body">
      <el-header class="layout__header">
        <el-breadcrumb separator="/">
          <el-breadcrumb-item v-for="(title, index) in breadcrumbs" :key="index">{{ title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <div class="layout__spacer" />
        <el-tooltip :content="fullscreen ? '退出全屏' : '全屏'" placement="bottom">
          <el-icon class="layout__action" @click="toggleFullscreen"><FullScreen /></el-icon>
        </el-tooltip>
        <el-tooltip content="界面设置" placement="bottom">
          <el-icon class="layout__action" @click="settings.panelVisible = true"><Setting /></el-icon>
        </el-tooltip>
        <el-dropdown trigger="click" @command="handleCommand">
          <span class="layout__user">
            <el-avatar :size="28" :src="user.profile?.avatar || undefined">
              {{ user.profile?.nickname?.slice(0, 1) || 'U' }}
            </el-avatar>
            <span class="layout__username">{{ user.profile?.nickname || user.profile?.username }}</span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人中心</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <TagsView />

      <el-main class="layout__main">
        <el-scrollbar class="layout__scroll">
          <div class="layout__content">
            <router-view v-slot="{ Component, route: currentRoute }">
              <keep-alive :include="cachedViews">
                <component :is="Component" :key="currentRoute.path" />
              </keep-alive>
            </router-view>
          </div>
        </el-scrollbar>
      </el-main>
    </el-container>

    <SettingsPanel />
  </el-container>
</template>

<style scoped lang="scss">
.layout {
  height: 100vh;
}

.layout__aside {
  display: flex;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, #1b2d43 0%, #16263a 52%, #101b29 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 0.22s ease;
}

.layout__logo {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  height: var(--app-header-height);
  padding: 0 16px;
  color: #fff;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.layout__logo.is-collapsed {
  justify-content: center;
  padding: 0;
}

.layout__logo-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    var(--el-color-primary),
    color-mix(in srgb, var(--el-color-primary) 45%, #7c4dff)
  );
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.layout__logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.layout__logo-mini {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.layout__logo-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.layout__logo-text {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.layout__logo-sub {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.35);
}

.layout__menu-scroll {
  flex: 1;
  min-height: 0;
  padding: 8px 0;
}

.layout__menu-scroll :deep(.el-menu) {
  --el-menu-bg-color: transparent !important;
  --el-menu-text-color: #aeb9c9;
  --el-menu-hover-bg-color: rgba(255, 255, 255, 0.06);
  --el-menu-active-color: #ffffff;

  border-right: none;
  background: transparent !important;
}

.layout__menu-scroll :deep(.el-menu-item),
.layout__menu-scroll :deep(.el-sub-menu__title) {
  position: relative;
  height: 42px;
  padding: 0 12px !important;
  margin: 4px 10px;
  line-height: 42px;
  border-radius: 8px;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.layout__menu-scroll :deep(.el-menu-item .el-icon),
.layout__menu-scroll :deep(.el-sub-menu__title .el-icon) {
  margin-right: 10px;
  font-size: 18px;
}

/* 二级菜单保留缩进，避免和一级项视觉上同级 */
.layout__menu-scroll :deep(.el-menu .el-menu .el-menu-item) {
  padding-left: 45px !important;
}

.layout__menu-scroll :deep(.el-menu-item:hover),
.layout__menu-scroll :deep(.el-sub-menu__title:hover) {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.layout__menu-scroll :deep(.el-menu-item.is-active) {
  font-weight: 600;
  color: #fff !important;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--el-color-primary) 34%, transparent),
    color-mix(in srgb, var(--el-color-primary) 12%, transparent)
  );
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.layout__menu-scroll :deep(.el-menu-item.is-active::before) {
  position: absolute;
  top: 50%;
  left: 0;
  width: 3px;
  height: 18px;
  content: '';
  background: var(--el-color-primary);
  border-radius: 0 3px 3px 0;
  transform: translateY(-50%);
}

.layout__menu-scroll :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.layout__menu-scroll :deep(.el-scrollbar__thumb) {
  background: rgba(255, 255, 255, 0.18);
}

/* 收起状态：图标居中、隐藏左侧强调条 */
.layout__menu-scroll :deep(.el-menu--collapse) {
  width: 64px;
}

.layout__menu-scroll :deep(.el-menu--collapse .el-menu-item),
.layout__menu-scroll :deep(.el-menu--collapse .el-sub-menu__title) {
  justify-content: center;
  padding: 0 !important;
  margin: 4px 8px;
}

.layout__menu-scroll :deep(.el-menu--collapse .el-menu-tooltip__trigger) {
  justify-content: center;
  padding: 0 !important;
}

.layout__menu-scroll :deep(.el-menu--collapse .el-icon) {
  margin-right: 0;
}

.layout__menu-scroll :deep(.el-menu--collapse .el-menu-item.is-active::before) {
  display: none;
}

.layout__aside-footer {
  flex: none;
  padding: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.layout__collapse-btn {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 38px;
  padding: 0 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 8px;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.layout__collapse-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.07);
}

.layout__collapse-btn.is-collapsed {
  justify-content: center;
  padding: 0;
}

.layout__collapse-btn .el-icon {
  font-size: 17px;
}

.layout__body {
  min-width: 0;
}

.layout__header {
  display: flex;
  align-items: center;
  gap: 16px;
  height: var(--app-header-height);
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}

.layout__spacer {
  flex: 1;
}

.layout__action {
  font-size: 18px;
  color: #606266;
  cursor: pointer;
  transition: color 0.2s ease;
}

.layout__action:hover {
  color: var(--el-color-primary);
}

.layout__user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.layout__username {
  font-size: 14px;
  color: #303133;
}

.layout__main {
  flex: 1;
  min-height: 0;
  padding: var(--app-main-padding-top, var(--app-main-padding, 12px))
    var(--app-main-padding-right, var(--app-main-padding, 12px))
    var(--app-main-padding-bottom, var(--app-main-padding, 12px))
    var(--app-main-padding-left, var(--app-main-padding, 12px));
  overflow: hidden;
  background: var(--app-content-bg);
}

.layout__scroll {
  height: 100%;
}

.layout__scroll :deep(.el-scrollbar__view) {
  height: 100%;
}

.layout__content {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  padding-right: 6px;
}
</style>
