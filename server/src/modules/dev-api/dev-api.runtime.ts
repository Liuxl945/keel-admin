import { AppDataSource } from '../../db/data-source';
import { DevDataSource, DevDbTable, DevModel } from '../../db/entities';
import type { DbColumnInfo } from '../dev-db-table/dev-db-table.introspect';
import { withDataSource } from '../dev-data-source/data-source.client';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import type { DevApi, DevApiAction } from '../../db/entities/dev-api.entity';
import type {
  DevApiConfig,
  DevApiParam,
  RunDevApiInput,
} from './dev-api.dto';
import {
  assertSqlTemplate,
  bindSqlTemplate,
  createBinder,
  extractSqlParams,
  extractTableRefs,
  normalizeSql,
  quoteIdentifier,
  sanitizeDbError,
  type SqlDbType,
} from './dev-api.sql';

/** 系统表与元数据表不允许出现在数据接口里，避免通过接口探测基座结构 */
const RESERVED_TABLE = /^(sys_|dev_|information_schema|pg_|mysql\.|performance_schema)/i;

export interface SqlContext {
  source: DevDataSource;
  dbType: SqlDbType;
  allowedTables: Set<string>;
  columns: DbColumnInfo[];
  columnNames: Set<string>;
}

export interface RunDevApiResult {
  category: 'STATIC' | 'SQL';
  action: DevApiAction | null;
  sql: string | null;
  params: unknown[];
  rows: unknown[];
  total: number | null;
  page: number | null;
  pageSize: number | null;
  returnMode: string;
  affectedRows: number | null;
  insertId: number | null;
  durationMs: number;
  truncated: boolean;
}

/** 加载连接、模型与同步表元数据：SQL 里所有标识符只能来自这里 */
export async function loadSqlContext(row: DevApi): Promise<SqlContext> {
  if (!row.connection_id || !row.model_id || !row.table_name || !row.action) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'SQL 接口必须配置数据连接、建模数据、目标表和动作');
  }

  const source = await AppDataSource.getRepository(DevDataSource).findOneBy({ id: row.connection_id });
  if (!source) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据连接不存在');
  if (source.status !== 'ENABLED') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据连接已禁用，请先启用');
  }

  const model = await AppDataSource.getRepository(DevModel).findOneBy({ id: row.model_id });
  if (!model) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '建模数据不存在');
  if (model.connection_id !== row.connection_id) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '建模数据与数据连接不属于同一个连接');
  }
  const modelTable = model.published_table_name || model.table_name;
  if (modelTable !== row.table_name) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `建模数据对应的表为 ${modelTable}，与所选目标表不一致`);
  }

  const synced = await AppDataSource.getRepository(DevDbTable).findBy({
    connection_id: row.connection_id,
  });
  const allowedTables = new Set(
    synced
      .map((table) => table.table_name.toLowerCase())
      .filter((name) => !RESERVED_TABLE.test(name)),
  );
  const target = synced.find((table) => table.table_name === row.table_name);
  if (!target) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '目标表尚未同步，请先在数据连接里同步库表');
  }

  let columns: DbColumnInfo[] = [];
  try {
    const parsed = JSON.parse(target.columns_json) as DbColumnInfo[];
    if (Array.isArray(parsed)) columns = parsed;
  } catch {
    columns = [];
  }

  return {
    source,
    dbType: source.db_type === 'mysql' ? 'mysql' : 'postgres',
    allowedTables,
    columns,
    columnNames: new Set(columns.map((column) => column.columnName)),
  };
}

/** 保存前校验：语句类型、表引用白名单、结果列与排序列白名单 */
export async function validateApiDefinition(row: DevApi, config: DevApiConfig): Promise<void> {
  if (row.category === 'STATIC') {
    if (!config.staticData.trim()) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请填写静态数据 JSON');
    }
    const parsed = JSON.parse(config.staticData) as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '静态数据必须是 JSON 对象或数组');
    }
    return;
  }

  assertSqlTemplate(config.sql, row.action as DevApiAction);
  const context = await loadSqlContext(row);

  const refs = extractTableRefs(config.sql);
  if (refs.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'SQL 中没有识别到表引用，请检查 FROM / JOIN / INTO 写法');
  }
  for (const table of refs) {
    if (!context.allowedTables.has(table)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `SQL 引用的表 ${table} 不在已同步的业务表白名单中`,
      );
    }
  }

  for (const mapping of config.fieldMappings) {
    if (!context.columnNames.has(mapping.columnName)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `结果列 ${mapping.columnName} 不在目标表字段中`,
      );
    }
  }
  const process = config.dataProcess;
  if (process.orderBy && !context.columnNames.has(process.orderBy)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `排序字段 ${process.orderBy} 不在目标表字段中`,
    );
  }
  if (process.paging && row.action !== 'QUERY') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '只有查询动作可以开启分页');
  }
}

/** 参数值按声明的类型转换；空值统一绑定 null，不拼进 SQL */
function coerceParam(param: DevApiParam, raw: unknown): unknown {
  const fallback = param.sampleValue || param.defaultValue;
  const text = raw === undefined || raw === null || raw === '' ? fallback : String(raw);
  if (text === '' || text === null) {
    if (param.required) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `参数「${param.label || param.key}」不能为空`);
    }
    return null;
  }
  switch (param.type) {
    case 'number': {
      const value = Number(text);
      if (Number.isNaN(value)) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, `参数「${param.label || param.key}」需为数字`);
      }
      return value;
    }
    case 'boolean':
      if (['true', '1', 'yes', 'on'].includes(text.toLowerCase())) return true;
      if (['false', '0', 'no', 'off'].includes(text.toLowerCase())) return false;
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `参数「${param.label || param.key}」需为布尔值`);
    default:
      return text;
  }
}

/** Date / bigint / Buffer 转成可序列化值，保证返回体是干净 JSON */
function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  return value;
}

/** 结果列 → 输出 key；mappedOnly 开启时只保留映射过的字段 */
function mapRows(rows: Record<string, unknown>[], config: DevApiConfig, mappedOnly: boolean): unknown[] {
  const mapping = new Map(
    config.fieldMappings
      .filter((item) => !item.hidden)
      .map((item) => [item.columnName, item.outputKey]),
  );
  const hidden = new Set(config.fieldMappings.filter((item) => item.hidden).map((item) => item.columnName));
  return rows.map((row) => {
    // 静态数据允许是原始值数组，这类元素不做字段映射
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const output: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(row)) {
      if (hidden.has(column)) continue;
      const key = mapping.get(column) ?? column;
      if (mapping.has(column) || !mappedOnly) output[key] = normalizeValue(value);
    }
    return output;
  });
}

function applyStaticResult(
  parsed: unknown,
  config: DevApiConfig,
  page: number,
  pageSize: number,
): { rows: unknown[]; total: number | null; truncated: boolean } {
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const process = config.dataProcess;
  let items = list;
  let total: number | null = null;
  if (process.paging) {
    total = list.length;
    items = list.slice((page - 1) * pageSize, page * pageSize);
  }
  const truncated = items.length > process.maxRows;
  if (truncated) items = items.slice(0, process.maxRows);

  const mapped = mapRows(items as Record<string, unknown>[], config, process.mappedOnly);
  let rows: unknown[] = mapped;
  if (process.returnMode === 'one') rows = mapped.length > 0 ? [mapped[0]] : [];
  if (process.returnMode === 'count') rows = [{ count: total ?? list.length }];
  return { rows, total, truncated };
}

/** 在线调试执行：静态数据直接返回，SQL 走绑定 + 白名单 + 结果映射 */
export async function runDevApi(
  row: DevApi,
  config: DevApiConfig,
  input: RunDevApiInput,
): Promise<RunDevApiResult> {
  const started = Date.now();
  const process = config.dataProcess;
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? process.pageSize;

  if (row.category === 'STATIC') {
    if (!config.staticData.trim()) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先在数据配置里填写静态数据 JSON');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(config.staticData) as unknown;
    } catch {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '静态数据不是合法 JSON');
    }
    const result = applyStaticResult(parsed, config, page, pageSize);
    return {
      category: 'STATIC',
      action: null,
      sql: null,
      params: [],
      rows: result.rows,
      total: result.total,
      page: process.paging ? page : null,
      pageSize: process.paging ? pageSize : null,
      returnMode: process.returnMode,
      affectedRows: null,
      insertId: null,
      durationMs: Date.now() - started,
      truncated: result.truncated,
    };
  }

  await validateApiDefinition(row, config);
  const context = await loadSqlContext(row);
  const action = row.action as DevApiAction;
  const values: Record<string, unknown> = {};
  for (const param of config.params) {
    values[param.key] = coerceParam(param, input.params[param.key]);
  }
  // 理论上 DTO 已挡住未声明参数，这里再兜一次，防止旧数据绕过
  for (const key of extractSqlParams(config.sql)) {
    if (!(key in values)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `SQL 中的参数 :${key} 未声明`);
    }
  }

  const binder = createBinder(context.dbType);
  let baseSql = bindSqlTemplate(normalizeSql(config.sql), values, binder);
  if (process.orderBy) {
    if (/\bORDER\s+BY\b/i.test(baseSql)) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'SQL 模板里已包含 ORDER BY，请清空数据处理里的排序字段');
    }
    baseSql += ` ORDER BY ${quoteIdentifier(context.dbType, process.orderBy)} ${process.orderDir}`;
  }
  const baseParams = [...binder.params];

  const paging = action === 'QUERY' && process.paging && process.returnMode === 'list';
  if (paging && /\bLIMIT\b/i.test(baseSql)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '开启分页时 SQL 模板里不能再写 LIMIT');
  }

  let finalSql = baseSql;
  let finalParams = baseParams;
  if (paging) {
    const limit = binder.bind(pageSize);
    const offset = binder.bind((page - 1) * pageSize);
    finalSql = `${baseSql} LIMIT ${limit} OFFSET ${offset}`;
    finalParams = [...binder.params];
  }

  let rawRows: Record<string, unknown>[] = [];
  let total: number | null = null;
  let affectedRows: number | null = null;
  let insertId: number | null = null;

  try {
    if (paging) {
      const countSql = `SELECT COUNT(*) AS total FROM (${baseSql}) AS _api_count`;
      const countRows = await withDataSource(context.source, (query) => query(countSql, baseParams));
      const first = Array.isArray(countRows) ? countRows[0] : (countRows as unknown as Record<string, unknown>);
      const rawTotal = first?.total ?? first?.count;
      total = rawTotal === undefined || rawTotal === null ? null : Number(rawTotal);
    }
    const result = await withDataSource(context.source, (query) => query(finalSql, finalParams));
    const asArray = Array.isArray(result) ? result : [result as unknown as Record<string, unknown>];
    rawRows = asArray;
    if (action !== 'QUERY') {
      const packet = asArray[0] as Record<string, unknown> | undefined;
      affectedRows = packet?.affectedRows === undefined ? null : Number(packet.affectedRows);
      insertId = packet?.insertId === undefined ? null : Number(packet.insertId);
    }
  } catch (error) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `SQL 执行失败：${sanitizeDbError(error)}`,
    );
  }

  let rows: unknown[];
  let truncated = false;
  if (action === 'QUERY') {
    let mapped = mapRows(rawRows, config, process.mappedOnly);
    if (mapped.length > process.maxRows) {
      mapped = mapped.slice(0, process.maxRows);
      truncated = true;
    }
    if (process.returnMode === 'one') rows = mapped.length > 0 ? [mapped[0]] : [];
    else if (process.returnMode === 'count') rows = [{ count: total ?? mapped.length }];
    else rows = mapped;
  } else {
    rows = mapRows(rawRows, config, process.mappedOnly);
  }

  return {
    category: 'SQL',
    action,
    sql: finalSql,
    params: finalParams.map((value) => normalizeValue(value)),
    rows,
    total,
    page: paging ? page : null,
    pageSize: paging ? pageSize : null,
    returnMode: process.returnMode,
    affectedRows,
    insertId,
    durationMs: Date.now() - started,
    truncated,
  };
}
