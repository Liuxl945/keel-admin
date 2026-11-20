/**
 * 生成代码附带的菜单 SQL。
 *
 * 下载时后端已经在本库把菜单建好了，这份 SQL 是给「部署到另一个环境」用的：
 * 只依赖 perm 判重，可重复执行，不需要知道目标库的自增 id。
 */

import type { DevForm } from '../../../db/entities';
import { FORM_MENU_BUTTONS, formMenuPerm } from '../../menu/menu.constants';

/** SQL 字符串字面量转义（单引号翻倍） */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function generateMenuSql(form: DevForm): string {
  const key = form.form_key;
  const path = `/biz/${key}`;
  const component = `biz/${key}/index`;
  const listPerm = formMenuPerm(key, 'list');

  const lines: string[] = [
    `-- 业务菜单：${form.name}（${key}）`,
    `-- 组件：${component}    路径：${path}`,
    `-- 权限：${listPerm}，以及 ${FORM_MENU_BUTTONS.map((item) => formMenuPerm(key, item.action)).join('、')}`,
    '-- 说明：本脚本按 perm 判重，可重复执行；默认挂顶级菜单，',
    '--       如需挂到目录下，把第一段 SELECT 里的 parent_id（NULL）改成目标目录 id。',
    '',
    'INSERT INTO sys_menus (parent_id, name, type, path, component, perm, icon, sort, visible, status)',
    `SELECT NULL, ${quote(form.name)}, 'MENU', ${quote(path)}, ${quote(component)}, ${quote(listPerm)}, 'Document',`,
    '       (SELECT COALESCE(MAX(sort), 0) + 1 FROM sys_menus WHERE parent_id IS NULL), TRUE, \'ENABLED\'',
    'FROM (SELECT 1) AS seed',
    `WHERE NOT EXISTS (SELECT 1 FROM sys_menus WHERE perm = ${quote(listPerm)});`,
  ];

  for (const [index, item] of FORM_MENU_BUTTONS.entries()) {
    const perm = formMenuPerm(key, item.action);
    lines.push(
      '',
      'INSERT INTO sys_menus (parent_id, name, type, path, component, perm, icon, sort, visible, status)',
      `SELECT m.id, ${quote(item.name)}, 'BUTTON', NULL, NULL, ${quote(perm)}, NULL, ${index + 1}, FALSE, 'ENABLED'`,
      'FROM sys_menus m',
      `WHERE m.perm = ${quote(listPerm)}`,
      `  AND NOT EXISTS (SELECT 1 FROM sys_menus WHERE perm = ${quote(perm)});`,
    );
  }

  // 授权：只建菜单不分配角色，除了超管谁都看不到；默认给「系统管理员」角色开通
  const allPerms = [listPerm, ...FORM_MENU_BUTTONS.map((item) => formMenuPerm(key, item.action))];
  lines.push(
    '',
    '-- 授权：把上述权限点分配给「系统管理员」角色（code = system_admin）',
    '--       目标库没有该角色时这段不会插入任何行，可放心执行',
    'INSERT INTO sys_role_menus (role_id, menu_id)',
    'SELECT r.id, m.id FROM sys_roles r, sys_menus m',
    `WHERE r.code = ${quote('system_admin')} AND r.deleted_at IS NULL`,
    `  AND m.perm IN (${allPerms.map(quote).join(', ')})`,
    '  AND NOT EXISTS (',
    '    SELECT 1 FROM sys_role_menus x WHERE x.role_id = r.id AND x.menu_id = m.id',
    '  );',
  );

  lines.push('');
  return lines.join('\n');
}
