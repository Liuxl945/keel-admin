export const CONFIG_KEYS = {
  SYSTEM_NAME: 'system_name',
  SYSTEM_LOGO: 'system_logo',
  LOGIN_NOTICE: 'login_notice',
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

export interface ConfigDefinition {
  key: ConfigKey;
  value: string;
  name: string;
  description: string;
  category: 'CONTENT' | 'SYSTEM';
}

/**
 * 配置项单点真相：seed、更新接口、后台表单都以这里为准。
 * 新增配置先加定义，再在白名单里确认是否需要下发给 App。
 */
export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  {
    key: CONFIG_KEYS.SYSTEM_NAME,
    value: 'Keel（龙骨）',
    name: '系统名称',
    description: '登录页与后台左上角展示的名称',
    category: 'SYSTEM',
  },
  {
    key: CONFIG_KEYS.SYSTEM_LOGO,
    value: '',
    name: '系统 Logo',
    description: 'Logo 图片地址，留空则显示文字名称',
    category: 'SYSTEM',
  },
  {
    key: CONFIG_KEYS.LOGIN_NOTICE,
    value: '',
    name: '登录页公告',
    description: '展示在登录表单下方的提示文案，可留空',
    category: 'CONTENT',
  },
];

export const PUBLIC_CONFIG_KEYS: ConfigKey[] = [
  CONFIG_KEYS.SYSTEM_NAME,
  CONFIG_KEYS.SYSTEM_LOGO,
  CONFIG_KEYS.LOGIN_NOTICE,
];
