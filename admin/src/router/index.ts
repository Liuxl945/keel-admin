import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useTagsViewStore } from '@/stores/tagsView';
import { useUserStore } from '@/stores/user';
import { addDynamicRoutes } from './dynamic';

const Layout = () => import('@/layout/index.vue');

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    name: 'Layout',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: { title: '个人中心', cacheName: 'Profile' },
      },
      {
        // 独立预览页：按表单 id 动态渲染关联表的真实 CRUD
        path: 'dev/form/preview/:id',
        name: 'DevFormPreview',
        component: () => import('@/views/dev/form/preview/index.vue'),
        meta: { title: '表单预览', perm: 'dev_form:list', cacheName: 'DevFormPreview' },
      },
      {
        // 旧地址兼容：表单设计器已改为覆盖内容区的弹窗
        path: 'dev/form/design/:id',
        redirect: (to) => ({
          path: '/dev/form',
          query: { designId: String(to.params.id) },
        }),
      },
      {
        // 旧地址兼容：设计器已改为覆盖内容区的弹窗
        path: 'dev/model/design/:id',
        redirect: (to) => ({
          path: '/dev/model',
          query: { designId: String(to.params.id) },
        }),
      },
    ],
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限' },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在' },
  },
  {
    // 不能重定向到 /404：动态路由尚未注册时，/dashboard 会先落到这里，
    // 提前重定向会让守卫补注册路由后仍然停在 404 页面
    path: '/:pathMatch(.*)*',
    name: 'CatchAll',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const user = useUserStore();

  if (to.path === '/login') {
    if (user.accessToken) return { path: '/' };
    return true;
  }

  if (!user.accessToken) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (!user.profileLoaded) {
    try {
      await user.fetchProfile();
      addDynamicRoutes(router, user.menus);
      // 路由是刚注册的，重新走一次匹配；query 必须单独传，否则 ?designId= 会在首次加载时丢失
      return { path: to.path, query: to.query, hash: to.hash, replace: true };
    } catch {
      user.clearSession();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }

  if (to.meta.perm && !user.hasPermission(String(to.meta.perm))) {
    return '/403';
  }

  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title ? `${title} - Keel` : 'Keel';
  useTagsViewStore().addView(to);
});

export default router;
