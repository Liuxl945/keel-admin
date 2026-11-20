import type { DevDataSource } from '../../db/entities';
import { withDataSource } from '../dev-data-source/data-source.client';
import type { DevModelFieldType } from '../dev-model/dev-model.dto';

const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);
const RESERVED_TABLES = /^(sys_|dev_|operation_logs$|login_logs$|members$|uploaded_files$|migrations$)/;

export interface DbColumnInfo {
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

export interface DbTableInfo {
  tableName: string;
  tableComment: string;
  columns: DbColumnInfo[];
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapMysqlColumn(row: Record<string, unknown>): DbColumnInfo {
  const dataType = String(row.data_type ?? '').toLowerCase();
  const columnType = String(row.column_type ?? '').toLowerCase();
  const length = toNumber(row.character_maximum_length, 255) || 255;
  const precision = toNumber(row.numeric_precision, 10) || 10;
  const scale = toNumber(row.numeric_scale, 2);
  let type: DevModelFieldType | null = null;
  let supported = true;

  if (dataType === 'varchar' || dataType === 'char') {
    type = 'varchar';
  } else if (['tinytext', 'text', 'mediumtext', 'longtext'].includes(dataType)) {
    type = 'text';
  } else if (dataType === 'tinyint') {
    type = columnType.startsWith('tinyint(1)') ? 'boolean' : 'int';
  } else if (['smallint', 'mediumint', 'int'].includes(dataType)) {
    type = 'int';
  } else if (['decimal', 'numeric'].includes(dataType)) {
    type = 'decimal';
  } else if (dataType === 'boolean') {
    type = 'boolean';
  } else if (dataType === 'date') {
    type = 'date';
  } else if (['datetime', 'timestamp'].includes(dataType)) {
    type = 'datetime';
  } else {
    type = null;
    supported = false;
  }

  return {
    columnName: String(row.column_name ?? ''),
    rawType: String(row.column_type ?? row.data_type ?? ''),
    type,
    supported,
    nullable: String(row.is_nullable ?? '').toUpperCase() === 'YES',
    primary: String(row.column_key ?? '').toUpperCase() === 'PRI',
    autoIncrement: String(row.extra ?? '').toLowerCase().includes('auto_increment'),
    length,
    precision,
    scale,
    comment: String(row.column_comment ?? ''),
    ordinal: toNumber(row.ordinal_position, 0),
  };
}

function mapPostgresColumn(row: Record<string, unknown>): DbColumnInfo {
  const dataType = String(row.data_type ?? '').toLowerCase();
  const length = toNumber(row.character_maximum_length, 255) || 255;
  const precision = toNumber(row.numeric_precision, 10) || 10;
  const scale = toNumber(row.numeric_scale, 2);
  let type: DevModelFieldType | null = null;
  let supported = true;

  if (dataType === 'character varying' || dataType === 'character') {
    type = 'varchar';
  } else if (dataType === 'text') {
    type = 'text';
  } else if (dataType === 'integer' || dataType === 'smallint') {
    type = 'int';
  } else if (dataType === 'numeric' || dataType === 'decimal') {
    type = 'decimal';
  } else if (dataType === 'boolean') {
    type = 'boolean';
  } else if (dataType === 'date') {
    type = 'date';
  } else if (dataType.startsWith('timestamp')) {
    type = 'datetime';
  } else if (dataType === 'uuid') {
    type = 'varchar';
    supported = true;
  } else {
    type = null;
    supported = false;
  }

  return {
    columnName: String(row.column_name ?? ''),
    rawType: String(row.data_type ?? ''),
    type,
    supported,
    nullable: String(row.is_nullable ?? '').toUpperCase() === 'YES',
    primary: Boolean(row.is_primary),
    autoIncrement: String(row.column_default ?? '').toLowerCase().includes('nextval'),
    length: dataType === 'uuid' ? 36 : length,
    precision,
    scale,
    comment: String(row.column_comment ?? ''),
    ordinal: toNumber(row.ordinal_position, 0),
  };
}

function groupTables(
  rows: Record<string, unknown>[],
  mapColumn: (row: Record<string, unknown>) => DbColumnInfo,
  comments: Map<string, string>,
): DbTableInfo[] {
  const tables = new Map<string, DbTableInfo>();

  for (const row of rows) {
    const tableName = String(row.table_name ?? '');
    if (!tableName) continue;
    let table = tables.get(tableName);
    if (!table) {
      table = {
        tableName,
        tableComment: comments.get(tableName) ?? String(row.table_comment ?? ''),
        columns: [],
      };
      tables.set(tableName, table);
    }
    table.columns.push(mapColumn(row));
  }

  for (const table of tables.values()) {
    table.columns.sort((a, b) => a.ordinal - b.ordinal);
  }
  return [...tables.values()].sort((a, b) => a.tableName.localeCompare(b.tableName));
}

export async function introspectDatabase(source: DevDataSource): Promise<DbTableInfo[]> {
  if (source.db_type === 'mysql') {
    const rows = await withDataSource(source, (query) =>
      query(
        `SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type, c.column_type,
                c.is_nullable, c.column_key, c.extra, c.character_maximum_length,
                c.numeric_precision, c.numeric_scale, c.column_comment,
                t.table_comment
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
         WHERE c.table_schema = DATABASE() AND t.table_type = 'BASE TABLE'
         ORDER BY c.table_name, c.ordinal_position`,
      ),
    );
    return groupTables(rows, mapMysqlColumn, new Map());
  }

  const [rows, commentRows] = await Promise.all([
    withDataSource(source, (query) =>
      query(
        `SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type,
                c.is_nullable, c.character_maximum_length, c.numeric_precision, c.numeric_scale,
                c.column_default,
                col_description((quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass, c.ordinal_position) AS column_comment,
                EXISTS (
                  SELECT 1
                  FROM information_schema.table_constraints tc
                  JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                   AND tc.table_schema = kcu.table_schema
                   AND tc.table_name = kcu.table_name
                  WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
                ) AS is_primary
         FROM information_schema.columns c
         WHERE c.table_schema = 'public'
         ORDER BY c.table_name, c.ordinal_position`,
      ),
    ),
    withDataSource(source, (query) =>
      query(
        `SELECT tablename AS table_name,
                obj_description((quote_ident(schemaname) || '.' || quote_ident(tablename))::regclass) AS table_comment
         FROM pg_tables WHERE schemaname = 'public'`,
      ),
    ),
  ]);

  const comments = new Map(
    commentRows.map((row) => [String(row.table_name ?? ''), String(row.table_comment ?? '')]),
  );
  return groupTables(rows, mapPostgresColumn, comments);
}

export async function introspectTable(
  source: DevDataSource,
  tableName: string,
): Promise<DbTableInfo | null> {
  if (source.db_type === 'mysql') {
    const rows = await withDataSource(source, (query) =>
      query(
        `SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type, c.column_type,
                c.is_nullable, c.column_key, c.extra, c.character_maximum_length,
                c.numeric_precision, c.numeric_scale, c.column_comment,
                t.table_comment
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
         WHERE c.table_schema = DATABASE() AND c.table_name = ? AND t.table_type = 'BASE TABLE'
         ORDER BY c.ordinal_position`,
        [tableName],
      ),
    );
    return groupTables(rows, mapMysqlColumn, new Map())[0] ?? null;
  }

  const [rows, commentRows] = await Promise.all([
    withDataSource(source, (query) =>
      query(
        `SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type,
                c.is_nullable, c.character_maximum_length, c.numeric_precision, c.numeric_scale,
                c.column_default,
                col_description((quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass, c.ordinal_position) AS column_comment,
                EXISTS (
                  SELECT 1
                  FROM information_schema.table_constraints tc
                  JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                   AND tc.table_schema = kcu.table_schema
                   AND tc.table_name = kcu.table_name
                  WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
                ) AS is_primary
         FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = $1
         ORDER BY c.ordinal_position`,
        [tableName],
      ),
    ),
    withDataSource(source, (query) =>
      query(
        `SELECT tablename AS table_name,
                obj_description((quote_ident(schemaname) || '.' || quote_ident(tablename))::regclass) AS table_comment
         FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`,
        [tableName],
      ),
    ),
  ]);

  const comments = new Map(
    commentRows.map((row) => [String(row.table_name ?? ''), String(row.table_comment ?? '')]),
  );
  return groupTables(rows, mapPostgresColumn, comments)[0] ?? null;
}

export function evaluateImportable(table: DbTableInfo): {
  importable: boolean;
  importMessage: string | null;
} {
  if (RESERVED_TABLES.test(table.tableName)) {
    return { importable: false, importMessage: '系统表不可导入' };
  }

  const columns = new Map(table.columns.map((column) => [column.columnName, column]));
  const id = columns.get('id');
  const createdAt = columns.get('created_at');
  const updatedAt = columns.get('updated_at');
  const deletedAt = columns.get('deleted_at');

  if (!id || !createdAt || !updatedAt || !deletedAt) {
    return {
      importable: false,
      importMessage: '缺少系统字段 id / created_at / updated_at / deleted_at',
    };
  }
  if (!id.primary) {
    return { importable: false, importMessage: 'id 不是主键' };
  }
  if (id.type !== 'int') {
    return { importable: false, importMessage: 'id 必须是 int 类型主键' };
  }
  if ([createdAt, updatedAt, deletedAt].some((column) => column.type !== 'datetime')) {
    return {
      importable: false,
      importMessage: 'created_at / updated_at / deleted_at 必须是 datetime 类型',
    };
  }

  const unsupported = table.columns.filter(
    (column) => !SYSTEM_COLUMNS.has(column.columnName) && !column.supported,
  );
  if (unsupported.length > 0) {
    return {
      importable: false,
      importMessage: `包含暂不支持的字段类型：${unsupported
        .slice(0, 5)
        .map((column) => `${column.columnName}(${column.rawType})`)
        .join('、')}`,
    };
  }

  return { importable: true, importMessage: null };
}
