export type DevApiCategory = 'STATIC' | 'SQL';
export type DevApiAction = 'QUERY' | 'INSERT' | 'UPDATE' | 'DELETE';
export type DevApiStatus = 'DRAFT' | 'PUBLISHED';
export type DevApiParamType = 'string' | 'number' | 'boolean' | 'date' | 'datetime';
export type DevApiReturnMode = 'list' | 'one' | 'count';

/** SQL 模板里的命名参数：示例值供在线调试预填 */
export interface DevApiParam {
  key: string;
  label: string;
  type: DevApiParamType;
  required: boolean;
  defaultValue: string;
  sampleValue: string;
}

/** 结果列 → 输出 key 的映射 */
export interface DevApiFieldMapping {
  columnName: string;
  outputKey: string;
  label: string;
  hidden: boolean;
}

export interface DevApiDataProcess {
  returnMode: DevApiReturnMode;
  paging: boolean;
  pageSize: number;
  orderBy: string;
  orderDir: 'ASC' | 'DESC';
  mappedOnly: boolean;
  maxRows: number;
}

export interface DevApiConfig {
  staticData: string;
  sql: string;
  params: DevApiParam[];
  fieldMappings: DevApiFieldMapping[];
  dataProcess: DevApiDataProcess;
}

export interface DevApiSummary {
  id: number;
  name: string;
  apiKey: string;
  category: DevApiCategory;
  description: string | null;
  connectionId: number | null;
  modelId: number | null;
  tableName: string | null;
  action: DevApiAction | null;
  status: DevApiStatus;
  version: number;
  publishedAt: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevApiDetail extends DevApiSummary {
  config: DevApiConfig;
}

export interface DevApiRunResult {
  category: DevApiCategory;
  action: DevApiAction | null;
  sql: string | null;
  params: unknown[];
  rows: unknown[];
  total: number | null;
  page: number | null;
  pageSize: number | null;
  returnMode: DevApiReturnMode;
  affectedRows: number | null;
  insertId: number | null;
  durationMs: number;
  truncated: boolean;
}

export interface DevApiQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: DevApiCategory;
  status?: DevApiStatus;
  action?: DevApiAction;
  connectionId?: number;
  [key: string]: unknown;
}

export interface CreateDevApiPayload {
  name: string;
  apiKey: string;
  category: DevApiCategory;
  description?: string | null;
  connectionId?: number | null;
  modelId?: number | null;
  tableName?: string | null;
  action?: DevApiAction | null;
  config: DevApiConfig;
}

export interface UpdateDevApiPayload {
  name?: string;
  description?: string | null;
  connectionId?: number | null;
  modelId?: number | null;
  tableName?: string | null;
  action?: DevApiAction | null;
  status?: DevApiStatus;
  config?: DevApiConfig;
}

export interface RunDevApiPayload {
  params: Record<string, string | number | boolean | null>;
  page?: number;
  pageSize?: number;
}

export const DEV_API_CATEGORY_LABELS: Record<DevApiCategory, string> = {
  STATIC: '静态数据',
  SQL: 'SQL 操作',
};

export const DEV_API_ACTION_LABELS: Record<DevApiAction, string> = {
  QUERY: '查询',
  INSERT: '增加',
  UPDATE: '修改',
  DELETE: '删除',
};

export const DEV_API_PARAM_TYPE_LABELS: Record<DevApiParamType, string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  date: '日期',
  datetime: '日期时间',
};

export function emptyDevApiConfig(): DevApiConfig {
  return {
    staticData: '',
    sql: '',
    params: [],
    fieldMappings: [],
    dataProcess: {
      returnMode: 'list',
      paging: false,
      pageSize: 20,
      orderBy: '',
      orderDir: 'ASC',
      mappedOnly: false,
      maxRows: 1000,
    },
  };
}
