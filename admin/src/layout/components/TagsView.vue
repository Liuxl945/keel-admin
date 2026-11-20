<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useTagsViewStore, type TagView } from '@/stores/tagsView';

const route = useRoute();
const router = useRouter();
const tagsView = useTagsViewStore();

function isActive(tag: TagView): boolean {
  return route.path === tag.path;
}

function handleClick(tag: TagView): void {
  if (route.fullPath !== tag.fullPath) void router.push(tag.fullPath);
}

function handleClose(tag: TagView): void {
  const wasActive = route.path === tag.path;
  tagsView.removeView(tag.path);
  if (!wasActive) return;

  const next = tagsView.views[tagsView.views.length - 1];
  void router.push(next ? next.fullPath : '/dashboard');
}

function handleCommand(command: string): void {
  if (command === 'others') {
    tagsView.closeOthers(route.path);
    return;
  }
  if (command === 'all') {
    tagsView.closeAll();
    if (route.path !== '/dashboard') void router.push('/dashboard');
  }
}
</script>

<template>
  <div class="tags-view">
    <el-scrollbar class="tags-view__scroll">
      <div class="tags-view__list">
        <div
          v-for="tag in tagsView.views"
          :key="tag.path"
          class="tags-view__item"
          :class="{ 'is-active': isActive(tag) }"
          :title="tag.title"
          @click="handleClick(tag)"
        >
          <span class="tags-view__dot" />
          <span class="tags-view__title">{{ tag.title }}</span>
          <button
            v-if="tag.closable"
            type="button"
            class="tags-view__close"
            aria-label="关闭页签"
            @click.stop="handleClose(tag)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <span v-if="tagsView.views.length === 0" class="tags-view__empty">暂无打开的页面</span>
      </div>
    </el-scrollbar>

    <el-dropdown trigger="click" placement="bottom-end" @command="handleCommand">
      <span class="tags-view__more" title="页签操作">
        <el-icon><ArrowDown /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="others">关闭其他</el-dropdown-item>
          <el-dropdown-item command="all" divided>关闭全部</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped lang="scss">
.tags-view {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  height: 42px;
  padding: 0 10px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.tags-view__scroll {
  flex: 1;
  min-width: 0;
}

.tags-view__list {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  height: 41px;
  white-space: nowrap;
}

.tags-view__item {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 9px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  user-select: none;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.tags-view__item:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}

.tags-view__item.is-active {
  color: #fff;
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--el-color-primary) 28%, transparent);
}

.tags-view__dot {
  flex: none;
  width: 6px;
  height: 6px;
  background: var(--el-color-primary);
  border-radius: 50%;
  opacity: 0.75;
  transition: background 0.18s ease;
}

.tags-view__item.is-active .tags-view__dot {
  background: #fff;
  opacity: 1;
}

.tags-view__title {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tags-view__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  margin-left: 1px;
  font-size: 11px;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0.6;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.tags-view__close:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  opacity: 1;
}

.tags-view__item.is-active .tags-view__close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
}

.tags-view__empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.tags-view__more {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-left: 1px solid var(--el-border-color-lighter);
  transition: color 0.18s ease;
}

.tags-view__more:hover {
  color: var(--el-color-primary);
}
</style>
