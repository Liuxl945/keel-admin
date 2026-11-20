import { AppError, ERROR_CODES } from '../../utils/app-error';

export type SqlDbType = 'mysql' | 'postgres';
export type SqlAction = 'QUERY' | 'INSERT' | 'UPDATE' | 'DELETE';

/** 动作与允许的语句首关键字一一对应，防止「查询」接口里藏一条 UPDATE */
const ACTION_KEYWORD: Record<SqlAction, string> = {
  QUERY: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

/** 语句内部不允许出现的跨类型写操作，CTE / 子查询也不放过 */
const CROSS_ACTION_KEYWORDS: Record<SqlAction, RegExp> = {
  QUERY: /\b(INSERT|UPDATE|DELETE)\b/i,
  INSERT: /\b(UPDATE|DELETE)\b/i,
  UPDATE: /\b(INSERT|DELETE)\b/i,
  DELETE: /\b(INSERT|UPDATE)\b/i,
};

/** DDL、元数据探测、延时函数与文件读写：一律不允许出现在数据接口里 */
const FORBIDDEN_KEYWORDS =
  /\b(DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|USE|SHOW|DESCRIBE|EXPLAIN|LOAD_FILE|OUTFILE|DUMPFILE|INFORMATION_SCHEMA|PG_CATALOG|PG_TABLES|SLEEP|BENCHMARK|WAITFOR|COPY|VACUUM|REINDEX|RENAME|MERGE)\b/i;

/** 只挖单引号字符串：语句检测与表引用提取还要保留双引号/反引号标识符 */
export function maskStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, '');
}

/** 字符串与引号标识符整体挖空，避免 ':xxx' 出现在其中被当成命名参数 */
export function maskSqlLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`/g, '');
}

/** 提取 :name 命名参数（PG 的 ::type 类型转换不会被误判） */
export function extractSqlParams(sql: string): string[] {
  const found = maskSqlLiterals(sql).match(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g) ?? [];
  return [...new Set(found.map((item) => item.slice(1)))];
}

export function quoteIdentifier(dbType: SqlDbType, name: string): string {
  return dbType === 'mysql'
    ? `\`${name.replace(/`/g, '``')}\``
    : `"${name.replace(/"/g, '""')}"`;
}

export interface SqlBinder {
  params: unknown[];
  bind(value: unknown): string;
}

/** MySQL 用 ?，PostgreSQL 用 $n；值一律进 params，不拼进 SQL */
export function createBinder(dbType: SqlDbType): SqlBinder {
  const params: unknown[] = [];
  return {
    params,
    bind(value: unknown): string {
      params.push(value);
      return dbType === 'mysql' ? '?' : `$${params.length}`;
    },
  };
}

/** 去掉尾部分号，供拼装分页/排序与执行使用 */
export function normalizeSql(sql: string): string {
  return sql.trim().replace(/;+\s*$/, '').trim();
}

/**
 * 保存与执行前共用的静态校验：单语句、无注释、语句类型与动作一致、无危险关键字。
 * 标识符白名单（表/列）在运行时结合 dev_db_tables 再做一次。
 */
export function assertSqlTemplate(sql: string, action: SqlAction): void {
  const cleaned = maskStringLiterals(sql).trim();
  if (!cleaned) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请填写 SQL 语句');
  }
  if (/--|\/\*|\*\//.test(cleaned)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'SQL 中不允许使用注释');
  }

  const withoutTailSemicolon = cleaned.replace(/;+\s*$/, '');
  if (withoutTailSemicolon.includes(';')) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '只允许执行单条 SQL 语句');
  }

  const forbidden = FORBIDDEN_KEYWORDS.exec(withoutTailSemicolon);
  if (forbidden) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `SQL 中不允许出现关键字 ${forbidden[0].toUpperCase()}`,
    );
  }

  const cross = CROSS_ACTION_KEYWORDS[action].exec(withoutTailSemicolon);
  if (cross) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `当前动作不允许在 SQL 中出现关键字 ${cross[0].toUpperCase()}`,
    );
  }

  const first = /^([A-Za-z]+)/.exec(withoutTailSemicolon)?.[1]?.toUpperCase();
  if (first !== ACTION_KEYWORD[action]) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `动作「${action}」的 SQL 必须以 ${ACTION_KEYWORD[action]} 开头`,
    );
  }
}

/**
 * 把 :name 替换为绑定占位符。只在非字符串片段替换，
 * 避免把 SQL 字符串字面量里的 ':xxx' 当成参数。
 */
export function bindSqlTemplate(
  sql: string,
  values: Record<string, unknown>,
  binder: SqlBinder,
): string {
  const parts = sql.split(/('(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`)/g);
  return parts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, key: string) =>
            binder.bind(values[key] ?? null),
          ),
    )
    .join('');
}

/** 表引用（FROM / JOIN / UPDATE / INTO / DELETE FROM）里的表名，用于白名单校验 */
export function extractTableRefs(sql: string): string[] {
  const masked = maskStringLiterals(sql);
  const refs = new Set<string>();
  const identifier = /(?:"[^"]+"|`[^`]+`|[a-zA-Z_][a-zA-Z0-9_]*)/;
  const pattern = new RegExp(
    `\\b(?:FROM|JOIN|UPDATE|INTO)\\s+(${identifier.source}(?:\\s*\\.\\s*${identifier.source})?)`,
    'gi',
  );
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const last = match[1].split('.').pop()!.trim().replace(/^["`]|["`]$/g, '');
    if (last) refs.add(last.toLowerCase());
  }
  return [...refs];
}

/** 数据库错误只回传压缩后的信息，避免把连接串或堆栈暴露到前端 */
export function sanitizeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'SQL 执行失败';
  return message.replace(/\s+/g, ' ').slice(0, 300);
}
