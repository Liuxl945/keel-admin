export type DevDataSourceType = 'mysql' | 'postgres';
export type DevDataSourceStatus = 'ENABLED' | 'DISABLED';

export interface DevDataSourceItem {
  id: number;
  name: string;
  code: string;
  dbType: DevDataSourceType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  hasPassword: boolean;
  status: DevDataSourceStatus;
  isDefault: boolean;
  remark: string | null;
  lastTestAt: string | null;
  lastTestStatus: 'SUCCESS' | 'FAILED' | null;
  lastTestMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevDataSourceOption {
  id: number;
  name: string;
  code: string;
  dbType: DevDataSourceType;
  databaseName: string;
  status: DevDataSourceStatus;
  isDefault: boolean;
}

export interface DataSourceTable {
  tableName: string;
  tableComment: string;
}

export type DevModelFieldType =
  | 'varchar'
  | 'text'
  | 'int'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime';

export interface DevModelField {
  label: string;
  columnName: string;
  fieldName: string;
  type: DevModelFieldType;
  length: number;
  precision: number;
  scale: number;
  nullable: boolean;
  unique: boolean;
  listVisible: boolean;
  formVisible: boolean;
  searchable: boolean;
}

export type DevModelStatus = 'DRAFT' | 'CREATED';

export interface DevModelSummary {
  id: number;
  name: string;
  modelKey: string;
  connectionId: number;
  connectionName: string | null;
  dbType: DevDataSourceType | null;
  tableName: string;
  publishedTableName: string | null;
  tableComment: string | null;
  status: DevModelStatus;
  createdTableAt: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevModelConnectionBrief {
  id: number;
  name: string;
  dbType: DevDataSourceType;
  databaseName: string;
  status: DevDataSourceStatus;
}

export interface DevModelDetail extends DevModelSummary {
  connection: DevModelConnectionBrief | null;
  fields: DevModelField[];
}

export interface DevModelDdlResult {
  action: 'CREATE' | 'ALTER' | 'NONE';
  dbType: DevDataSourceType;
  tableName: string;
  previousTableName: string | null;
  statements: string[];
  sql: string;
  message: string;
  warnings: string[];
  destructive: boolean;
}

export interface SyncedColumn {
  columnName: string;
  rawType: string;
  type: DevModelFieldType | null;
  supported: boolean;
  nullable: boolean;
  primary: boolean;
  autoIncrement: boolean;
  length: number;
  precision: number;
  scale: number;
  comment: string;
  ordinal: number;
}

export interface SyncedTableSummary {
  id: number;
  connectionId: number;
  tableName: string;
  tableComment: string | null;
  columnCount: number;
  syncedAt: string;
  importable: boolean;
  importMessage: string | null;
}

export interface SyncedTableDetail extends SyncedTableSummary {
  columns: SyncedColumn[];
}

