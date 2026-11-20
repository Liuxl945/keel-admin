import type { Router, RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '@/types/entities';

const viewModules = import.meta.glob('../views/**/*.vue');

let dynamicRouteNames: string[] = [];

function resolveComponent(component: string): (() => Promise<unknown>) | undefined {
  return viewModules[`../views/${component}.vue`] as (() => Promise<unknown>) | undefined;
}

/**
 * 组件路径 → keep-alive 名称：system/user/index → SystemUser。
 * 页面必须用 defineOptions({ name: 'SystemUser' }) 保持一致，才能命中缓存。
 */
function toCacheName(component: string): string {
  return component
    .replace(/\/index$/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * 菜单完全由后端下发，前端只负责把 component 字符串映射成真实组件。
 * 组件缺失时落到 404，而不是静默空白页。
 */
export function addDynamicRoutes(router: Router, menus: MenuNode[]): void {
  removeDynamicRoutes(router);

  const walk = (items: MenuNode[]): void => {
    for (const item of items) {
      // FORM 与 MENU 都是可访问页面，区别只在于 FORM 会带上关联表单 id
      if ((item.type === 'MENU' || item.type === 'FORM') && item.path) {
        const loader = item.component ? resolveComponent(item.component) : undefined;
        const name = `menu-${item.id}`;
        const route: RouteRecordRaw = {
          // 挂在 Layout 下的子路由用相对路径，避免不同 router 版本对绝对子路径的处理差异
          path: item.path.replace(/^\//, ''),
          name,
          component: loader ?? (() => import('@/views/error/404.vue')),
          meta: {
            title: item.name,
            perm: item.perm,
            icon: item.icon,
            // 组件名与页面 defineOptions({ name }) 对应，供 keep-alive 使用
            cacheName: item.component ? toCacheName(item.component) : undefined,
            // 运行时页面据此决定渲染哪张在线表单
            formId: item.type === 'FORM' ? item.formId : undefined,
          },
        };
        router.addRoute('Layout', route);
        dynamicRouteNames.push(name);
      }
      if (item.children?.length) walk(item.children);
    }
  };

  walk(menus);
}

export function removeDynamicRoutes(router: Router): void {
  for (const name of dynamicRouteNames) {
    if (router.hasRoute(name)) router.removeRoute(name);
  }
  dynamicRouteNames = [];
}
