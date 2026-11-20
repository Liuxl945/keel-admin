import mysql from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import type { DevDataSource } from '../../db/entities';
import { decryptSecret } from '../../utils/secret';

export type DataSourceQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/**
 * MySQL 8 对 information_schema 的裸列名查询会按数据字典元数据返回大写键
 * （TABLE_NAME / COLUMN_NAME 等），而内省、表同步等调用方都按小写键取值；
 * 这里统一把结果行的键转成小写。非数组结果（INSERT/UPDATE 的 OkPacket）
 * 键本身是小写的，原样返回以保留 affectedRows / insertId。
 */
function normalizeRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return rows as unknown as Record<string, unknown>[];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key.toLowerCase()] = value;
    }
    return out;
  });
}

function connectionOptions(source: DevDataSource) {
  return {
    host: source.host,
    port: source.port,
    database: source.database_name,
    user: source.username,
    password: decryptSecret(source.password_encrypted),
  };
}

/** 在线开发的数据连接是动态的，不能用固定的 TypeORM DataSource，直接走驱动客户端 */
export async function withDataSource<T>(
  source: DevDataSource,
  handler: (query: DataSourceQuery) => Promise<T>,
): Promise<T> {
  const options = connectionOptions(source);

  if (source.db_type === 'mysql') {
    const connection = await mysql.createConnection({
      host: options.host,
      port: options.port,
      database: options.database,
      user: options.user,
      password: options.password,
      connectTimeout: 5000,
      multipleStatements: false,
    });
    try {
      return await handler(async (sql, params = []) => {
        const [rows] = await connection.query(sql, params);
        return normalizeRows(rows);
      });
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  const client = new PgClient({
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
    password: options.password,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    return await handler(async (sql, params = []) => {
      const result = await client.query(sql, params);
      return result.rows as Record<string, unknown>[];
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}

function sanitizeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '连接失败';
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

export async function testDataSource(source: DevDataSource) {
  const started = Date.now();
  try {
    await withDataSource(source, (query) => query('SELECT 1 AS ok'));
    return { ok: true, message: '连接成功', latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, message: sanitizeMessage(error), latencyMs: Date.now() - started };
  }
}

export async function listDatabaseTables(source: DevDataSource) {
  const rows = await withDataSource(source, async (query) => {
    if (source.db_type === 'mysql') {
      return query(
        `SELECT table_name, table_comment
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
         ORDER BY table_name`,
      );
    }
    return query(
      `SELECT tablename AS table_name,
              obj_description((quote_ident(schemaname) || '.' || quote_ident(tablename))::regclass) AS table_comment
       FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename`,
    );
  });

  return rows.map((row) => ({
    tableName: String(row.table_name ?? ''),
    tableComment: row.table_comment ? String(row.table_comment) : '',
  }));
}

export async function tableExists(source: DevDataSource, tableName: string): Promise<boolean> {
  return withDataSource(source, async (query) => {
    if (source.db_type === 'mysql') {
      const rows = await query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
        [tableName],
      );
      return rows.length > 0;
    }
    const rows = await query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1 LIMIT 1',
      [tableName],
    );
    return rows.length > 0;
  });
}

export function executeStatements(source: DevDataSource, statements: string[]) {
  return withDataSource(source, async (query) => {
    // PostgreSQL 支持事务 DDL：中途失败可以整体回滚；MySQL DDL 隐式提交，只能逐条执行
    const transactional = source.db_type === 'postgres';
    if (transactional) await query('BEGIN');
    try {
      for (const statement of statements) {
        await query(statement);
      }
      if (transactional) await query('COMMIT');
    } catch (error) {
      if (transactional) await query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });
}
