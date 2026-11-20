import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';

export interface TagView {
  path: string;
  fullPath: string;
  title: string;
  closable: boolean;
  /** 页面组件的 name，用于 keep-alive include */
  cacheName?: string;
}

const SKIP_PATHS = new Set(['/login', '/404', '/403']);

export const useTagsViewStore = defineStore('tagsView', () => {
  const views = ref<TagView[]>([]);

  function addView(route: RouteLocationNormalized): void {
    if (SKIP_PATHS.has(route.path)) return;
    const title = route.meta?.title;
    if (typeof title !== 'string' || !title) return;

    const exists = views.value.find((view) => view.path === route.path);
    if (exists) {
      exists.fullPath = route.fullPath;
      return;
    }

    views.value.push({
      path: route.path,
      fullPath: route.fullPath,
      title,
      // 首页固定保留，其余页面可关闭
      closable: route.path !== '/dashboard',
      cacheName: typeof route.meta.cacheName === 'string' ? route.meta.cacheName : undefined,
    });
  }

  function removeView(path: string): void {
    views.value = views.value.filter((view) => view.path !== path);
  }

  function closeOthers(path: string): void {
    views.value = views.value.filter((view) => view.path === path || !view.closable);
  }

  function closeAll(): void {
    views.value = views.value.filter((view) => !view.closable);
  }

  function reset(): void {
    views.value = [];
  }

  return { views, addView, removeView, closeOthers, closeAll, reset };
});
