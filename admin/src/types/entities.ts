export type AccountStatus = 'ENABLED' | 'DISABLED';
export type MenuType = 'DIR' | 'MENU' | 'BUTTON' | 'FORM';

export interface RoleBrief {
  id: number;
  name: string;
  code: string;
}

export interface AdminUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  status: AccountStatus;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleBrief[];
}

export interface MenuNode {
  id: number;
  parentId: number | null;
  name: string;
  type: MenuType;
  path: string | null;
  component: string | null;
  perm: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  status: AccountStatus;
  /** type=FORM 时关联的在线表单 */
  formId: number | null;
  /** 列表展示用的表单名称 */
  formName?: string | null;
  children: MenuNode[];
  createdAt?: string;
}

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string | null;
  sort: number;
  status: AccountStatus;
  userCount: number;
  menuCount: number;
  createdAt: string;
}

export interface RoleDetail extends Role {
  menuIds: number[];
}

export interface RoleOption {
  id: number;
  name: string;
  code: string;
}

export interface ConfigItem {
  id: number;
  key: string;
  value: string;
  name: string;
  description: string | null;
  category: 'CONTENT' | 'SYSTEM';
  updatedAt: string;
}

export interface OperationLogItem {
  id: number;
  userId: number | null;
  username: string | null;
  method: string;
  path: string;
  statusCode: number;
  bizCode: number | null;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface OperationLogDetail extends OperationLogItem {
  query: string | null;
  body: string | null;
  response: string | null;
}

export interface LoginLogItem {
  id: number;
  userId: number | null;
  username: string | null;
  userType: 'ADMIN' | 'APP';
  success: boolean;
  message: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

export interface AppMember {
  id: number;
  nickname: string;
  avatar: string | null;
  phone: string | null;
  createdAt: string;
}

export type DictTagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

export interface DictType {
  id: number;
  dictName: string;
  dictType: string;
  status: AccountStatus;
  remark: string | null;
  createdAt: string;
}

export interface DictTypeOption {
  id: number;
  dictName: string;
  dictType: string;
}

export interface DictData {
  id: number;
  dictType: string;
  dictLabel: string;
  dictValue: string;
  dictSort: number;
  tagType: DictTagType;
  status: AccountStatus;
  remark: string | null;
}

export type NoticeType = 'NOTICE' | 'ANNOUNCEMENT';
export type NoticeStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export interface Notice {
  id: number;
  title: string;
  noticeType: NoticeType;
  content: string;
  status: NoticeStatus;
  publisherId: number | null;
  publisherName: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileItem {
  id: number;
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mimeType: string;
  uploaderId: number | null;
  uploaderName: string | null;
  createdAt: string;
}

export interface ServerInfo {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  nodeVersion: string;
  time: string;
  uptime: number;
  processUptime: number;
  cpu: {
    model: string;
    cores: number;
    load1: number;
    load5: number;
    load15: number;
    usagePercent: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  processMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  database: {
    type: string;
    status: string;
  };
}
