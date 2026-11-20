import type { SysMenuType } from './entities';

export interface MenuSeedNode {
  name: string;
  type: SysMenuType;
  path?: string | null;
  component?: string | null;
  perm?: string | null;
  icon?: string | null;
  sort?: number;
  visible?: boolean;
  status?: 'ENABLED' | 'DISABLED';
  children?: MenuSeedNode[];
}

/**
 * 菜单与权限的单点真相。新增页面/按钮只改这里，重跑 seed 即可。
 * component 必须与 admin/src/views 下的相对路径一致（不含 .vue）。
 */
export const MENU_SEED: MenuSeedNode[] = [
  {
    name: '数据概览',
    type: 'MENU',
    path: '/dashboard',
    component: 'dashboard/index',
    icon: 'Odometer',
    sort: 1,
  },
  {
    name: '系统管理',
    type: 'DIR',
    path: '/system',
    icon: 'Setting',
    sort: 10,
    children: [
      {
        name: '用户管理',
        type: 'MENU',
        path: '/system/user',
        component: 'system/user/index',
        perm: 'user:list',
        icon: 'User',
        sort: 1,
        children: [
          { name: '新增用户', type: 'BUTTON', perm: 'user:create' },
          { name: '查看用户', type: 'BUTTON', perm: 'user:detail' },
          { name: '编辑用户', type: 'BUTTON', perm: 'user:update' },
          { name: '删除用户', type: 'BUTTON', perm: 'user:delete' },
          { name: '分配角色', type: 'BUTTON', perm: 'user:assign' },
          { name: '重置密码', type: 'BUTTON', perm: 'user:reset' },
          { name: '导出用户', type: 'BUTTON', perm: 'user:export' },
          { name: '导入用户', type: 'BUTTON', perm: 'user:import' },
        ],
      },
      {
        name: '角色管理',
        type: 'MENU',
        path: '/system/role',
        component: 'system/role/index',
        perm: 'role:list',
        icon: 'Avatar',
        sort: 2,
        children: [
          { name: '新增角色', type: 'BUTTON', perm: 'role:create' },
          { name: '编辑角色', type: 'BUTTON', perm: 'role:update' },
          { name: '删除角色', type: 'BUTTON', perm: 'role:delete' },
          { name: '分配菜单', type: 'BUTTON', perm: 'role:assign' },
        ],
      },
      {
        name: '菜单管理',
        type: 'MENU',
        path: '/system/menu',
        component: 'system/menu/index',
        perm: 'menu:list',
        icon: 'Menu',
        sort: 3,
        children: [
          { name: '新增菜单', type: 'BUTTON', perm: 'menu:create' },
          { name: '编辑菜单', type: 'BUTTON', perm: 'menu:update' },
          { name: '删除菜单', type: 'BUTTON', perm: 'menu:delete' },
        ],
      },
      {
        name: '字典管理',
        type: 'MENU',
        path: '/system/dict',
        component: 'system/dict/index',
        perm: 'dict:list',
        icon: 'Collection',
        sort: 4,
        children: [
          { name: '新增字典', type: 'BUTTON', perm: 'dict:create' },
          { name: '编辑字典', type: 'BUTTON', perm: 'dict:update' },
          { name: '删除字典', type: 'BUTTON', perm: 'dict:delete' },
        ],
      },
      {
        name: '通知公告',
        type: 'MENU',
        path: '/system/notice',
        component: 'system/notice/index',
        perm: 'notice:list',
        icon: 'Bell',
        sort: 5,
        children: [
          { name: '新增公告', type: 'BUTTON', perm: 'notice:create' },
          { name: '编辑公告', type: 'BUTTON', perm: 'notice:update' },
          { name: '删除公告', type: 'BUTTON', perm: 'notice:delete' },
        ],
      },
      {
        name: '文件管理',
        type: 'MENU',
        path: '/system/file',
        component: 'system/file/index',
        perm: 'file:list',
        icon: 'Files',
        sort: 6,
        children: [{ name: '删除文件', type: 'BUTTON', perm: 'file:delete' }],
      },
      {
        name: '系统配置',
        type: 'MENU',
        path: '/system/config',
        component: 'system/config/index',
        perm: 'system:config',
        icon: 'Tools',
        sort: 7,
      },
      {
        name: '操作日志',
        type: 'MENU',
        path: '/system/log',
        component: 'system/log/index',
        perm: 'system:log',
        icon: 'Document',
        sort: 8,
      },
      { name: '文件上传', type: 'BUTTON', perm: 'system:upload', visible: false, sort: 90 },
    ],
  },
  {
    name: '系统监控',
    type: 'DIR',
    path: '/monitor',
    icon: 'Monitor',
    sort: 20,
    children: [
      {
        name: '服务监控',
        type: 'MENU',
        path: '/monitor/server',
        component: 'system/monitor/index',
        perm: 'monitor:server',
        icon: 'Monitor',
        sort: 1,
      },
    ],
  },
  {
    name: '在线开发',
    type: 'DIR',
    path: '/dev',
    icon: 'MagicStick',
    sort: 30,
    children: [
      {
        name: '表单设计',
        type: 'MENU',
        path: '/dev/form',
        component: 'dev/form/index',
        perm: 'dev_form:list',
        icon: 'EditPen',
        sort: 1,
        children: [
          { name: '新增表单', type: 'BUTTON', perm: 'dev_form:create' },
          { name: '编辑表单', type: 'BUTTON', perm: 'dev_form:update' },
          { name: '删除表单', type: 'BUTTON', perm: 'dev_form:delete' },
          { name: '发布表单', type: 'BUTTON', perm: 'dev_form:publish' },
        ],
      },
      {
        name: '数据连接',
        type: 'MENU',
        path: '/dev/datasource',
        component: 'dev/datasource/index',
        perm: 'dev_ds:list',
        icon: 'Connection',
        sort: 2,
        children: [
          { name: '新增连接', type: 'BUTTON', perm: 'dev_ds:create' },
          { name: '编辑连接', type: 'BUTTON', perm: 'dev_ds:update' },
          { name: '删除连接', type: 'BUTTON', perm: 'dev_ds:delete' },
          { name: '测试连接', type: 'BUTTON', perm: 'dev_ds:test' },
        ],
      },
      {
        name: '数据建模',
        type: 'MENU',
        path: '/dev/model',
        component: 'dev/model/index',
        perm: 'dev_model:list',
        icon: 'DataAnalysis',
        sort: 3,
        children: [
          { name: '新增模型', type: 'BUTTON', perm: 'dev_model:create' },
          { name: '编辑模型', type: 'BUTTON', perm: 'dev_model:update' },
          { name: '删除模型', type: 'BUTTON', perm: 'dev_model:delete' },
          { name: '执行建表', type: 'BUTTON', perm: 'dev_model:ddl' },
        ],
      },
      {
        name: '数据接口',
        type: 'MENU',
        path: '/dev/api',
        component: 'dev/api/index',
        perm: 'dev_api:list',
        icon: 'Link',
        sort: 4,
        children: [
          { name: '新增接口', type: 'BUTTON', perm: 'dev_api:create' },
          { name: '编辑接口', type: 'BUTTON', perm: 'dev_api:update' },
          { name: '删除接口', type: 'BUTTON', perm: 'dev_api:delete' },
          { name: '发布接口', type: 'BUTTON', perm: 'dev_api:publish' },
          { name: '试运行接口', type: 'BUTTON', perm: 'dev_api:run' },
        ],
      },
    ],
  },
];

export interface RoleSeed {
  name: string;
  code: string;
  description: string;
  sort: number;
}

export const ROLE_SEED: RoleSeed[] = [
  { name: '系统管理员', code: 'system_admin', description: '拥有全部菜单与权限', sort: 1 },
  { name: '查看员', code: 'viewer', description: '仅可查看列表数据', sort: 2 },
];

/** 查看员只拿列表/详情类只读权限，写操作与敏感配置一律不给 */
export function isViewerMenu(type: SysMenuType, perm: string | null): boolean {
  if (type === 'DIR') return true;
  if (!perm) return true;
  return perm.endsWith(':list');
}

/** 演示账户不能碰的高危权限：用户/角色/菜单/系统配置一旦被改会导致无法登录或菜单不可访问 */
const DEMO_DENIED_PERMS = new Set([
  'user:create',
  'user:update',
  'user:delete',
  'user:reset',
  'user:assign',
  'user:import',
  'role:create',
  'role:update',
  'role:delete',
  'role:assign',
  'menu:create',
  'menu:update',
  'menu:delete',
  'system:config',
]);

/** 演示账户除上面这批高危操作外，其余菜单与增删改查全部放开 */
export function isDemoMenu(type: SysMenuType, perm: string | null): boolean {
  if (type === 'DIR') return true;
  if (!perm) return true;
  return !DEMO_DENIED_PERMS.has(perm);
}

export interface DictSeedType {
  dictName: string;
  dictType: string;
  remark: string;
  data: Array<{
    label: string;
    value: string;
    sort: number;
    tagType: 'primary' | 'success' | 'info' | 'warning' | 'danger';
  }>;
}

/** 内置字典：状态、公告、菜单类型等通用枚举，避免业务代码散落硬编码文案 */
export const DICT_SEED: DictSeedType[] = [
  {
    dictName: '系统开关',
    dictType: 'sys_normal_disable',
    remark: '通用启用/禁用状态',
    data: [
      { label: '启用', value: 'ENABLED', sort: 1, tagType: 'success' },
      { label: '禁用', value: 'DISABLED', sort: 2, tagType: 'info' },
    ],
  },
  {
    dictName: '通知类型',
    dictType: 'sys_notice_type',
    remark: '通知公告分类',
    data: [
      { label: '通知', value: 'NOTICE', sort: 1, tagType: 'primary' },
      { label: '公告', value: 'ANNOUNCEMENT', sort: 2, tagType: 'warning' },
    ],
  },
  {
    dictName: '通知状态',
    dictType: 'sys_notice_status',
    remark: '公告发布状态',
    data: [
      { label: '草稿', value: 'DRAFT', sort: 1, tagType: 'info' },
      { label: '已发布', value: 'PUBLISHED', sort: 2, tagType: 'success' },
      { label: '已关闭', value: 'CLOSED', sort: 3, tagType: 'danger' },
    ],
  },
  {
    dictName: '菜单类型',
    dictType: 'sys_menu_type',
    remark: '目录/页面/表单/按钮',
    data: [
      { label: '目录', value: 'DIR', sort: 1, tagType: 'primary' },
      { label: '页面', value: 'MENU', sort: 2, tagType: 'success' },
      { label: '表单', value: 'FORM', sort: 3, tagType: 'warning' },
      { label: '按钮', value: 'BUTTON', sort: 4, tagType: 'info' },
    ],
  },
  {
    dictName: '表单设计状态',
    dictType: 'dev_form_status',
    remark: '在线开发表单状态',
    data: [
      { label: '草稿', value: 'DRAFT', sort: 1, tagType: 'info' },
      { label: '已发布', value: 'PUBLISHED', sort: 2, tagType: 'success' },
    ],
  },
  {
    dictName: '数据连接类型',
    dictType: 'dev_ds_type',
    remark: '在线开发数据连接类型',
    data: [
      { label: 'MySQL', value: 'mysql', sort: 1, tagType: 'warning' },
      { label: 'PostgreSQL', value: 'postgres', sort: 2, tagType: 'primary' },
    ],
  },
  {
    dictName: '数据模型状态',
    dictType: 'dev_model_status',
    remark: '在线开发数据模型状态',
    data: [
      { label: '草稿', value: 'DRAFT', sort: 1, tagType: 'info' },
      { label: '已发布', value: 'CREATED', sort: 2, tagType: 'success' },
    ],
  },
  {
    dictName: '数据接口类型',
    dictType: 'dev_api_category',
    remark: '数据接口的两大类型',
    data: [
      { label: '静态数据', value: 'STATIC', sort: 1, tagType: 'primary' },
      { label: 'SQL 操作', value: 'SQL', sort: 2, tagType: 'success' },
    ],
  },
  {
    dictName: '数据接口动作',
    dictType: 'dev_api_action',
    remark: 'SQL 接口允许的四类动作',
    data: [
      { label: '查询', value: 'QUERY', sort: 1, tagType: 'primary' },
      { label: '增加', value: 'INSERT', sort: 2, tagType: 'success' },
      { label: '修改', value: 'UPDATE', sort: 3, tagType: 'warning' },
      { label: '删除', value: 'DELETE', sort: 4, tagType: 'danger' },
    ],
  },
  {
    dictName: '数据接口状态',
    dictType: 'dev_api_status',
    remark: '在线开发数据接口状态',
    data: [
      { label: '草稿', value: 'DRAFT', sort: 1, tagType: 'info' },
      { label: '已发布', value: 'PUBLISHED', sort: 2, tagType: 'success' },
    ],
  },
];
