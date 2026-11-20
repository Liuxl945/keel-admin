/**
 * 表单业务菜单的权限约定，单独放在常量文件里，
 * 让代码生成（menu.sql）与菜单服务共用一份定义，避免两边漂移。
 */

/** 表单页的增删改权限点：查询权限挂在页面菜单上，这里是按钮级动作 */
export const FORM_MENU_BUTTONS = [
  { name: '新增', action: 'create' },
  { name: '编辑', action: 'update' },
  { name: '删除', action: 'delete' },
] as const;

/**
 * 表单业务权限统一为 `biz_<form_key>:<action>`：
 * - 与菜单规范一致（模块:动作，两段），`biz_ddlb` 就是模块名；
 * - 与代码生成产物里 `v-permission="'biz_ddlb:create'"` 同一套标识，
 *   在线预览页与独立生成页共用一份授权，换页面不用重新分配角色。
 */
export function formMenuPerm(formKey: string, action: string): string {
  return `biz_${formKey}:${action}`;
}
