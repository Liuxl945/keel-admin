import type { Directive } from 'vue';
import { useUserStore } from '@/stores/user';

/**
 * 按钮级权限：无权限直接移除节点，避免出现点了才报错的按钮。
 * 超管由 store.hasPermission 统一放行。
 */
export const permissionDirective: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const perm = binding.value;
    if (!perm) return;
    const user = useUserStore();
    if (!user.hasPermission(perm)) {
      el.parentNode?.removeChild(el);
    }
  },
};
