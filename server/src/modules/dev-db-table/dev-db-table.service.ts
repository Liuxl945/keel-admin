import { AppDataSource } from '../../db/data-source';
import { DevDataSource, DevDbTable } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { parsePagination } from '../../utils/pagination';
import {
  evaluateImportable,
  introspectDatabase,
  type DbColumnInfo,
  type DbTableInfo,
} from './dev-db-table.introspect';
import type { SyncedTableQuery } from './dev-db-table.dto';

function repo() {
  return AppDataSource.getRepository(DevDbTable);
}

function sourceRepo() {
  return AppDataSource.getRepository(DevDataSource);
}

function parseColumns(row: DevDbTable): DbColumnInfo[] {
  try {
    const parsed = JSON.parse(row.columns_json) as DbColumnInfo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function tableInfoFromRow(row: DevDbTable): DbTableInfo {
  return {
    tableName: row.table_name,
    tableComment: row.table_comment ?? '',
    columns: parseColumns(row),
  };
}

export async function syncDataSourceTables(source: DevDataSource): Promise<number> {
  const tables = await introspectDatabase(source);
  const syncedAt = new Date();

  await AppDataSource.transaction(async (manager) => {
    await manager.delete(DevDbTable, { connection_id: source.id });
    if (tables.length === 0) return;
    await manager.insert(
      DevDbTable,
      tables.map((table) => ({
        connection_id: source.id,
        table_name: table.tableName,
        table_comment: table.tableComment || null,
        columns_json: JSON.stringify(table.columns),
        column_count: table.columns.length,
        synced_at: syncedAt,
      })),
    );
  });

  return tables.length;
}

export async function syncTablesByConnection(connectionId: number): Promise<number> {
  const source = await sourceRepo().findOneBy({ id: connectionId });
  if (!source) throw new AppError(ERROR_CODES.NOT_FOUND, '数据连接不存在');
  return syncDataSourceTables(source);
}

export async function listSyncedTables(query: SyncedTableQuery) {
  const { page, pageSize } = parsePagination(query as Record<string, unknown>);
  const qb = repo()
    .createQueryBuilder('table')
    .orderBy('table.table_name', 'ASC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (query.connectionId) {
    qb.andWhere('table.connection_id = :connectionId', { connectionId: query.connectionId });
  }
  if (query.keyword) {
    qb.andWhere('(table.table_name LIKE :keyword OR table.table_comment LIKE :keyword)', {
      keyword: `%${query.keyword}%`,
    });
  }

  const [rows, total] = await qb.getManyAndCount();
  return {
    list: rows.map((row) => {
      const compatibility = evaluateImportable(tableInfoFromRow(row));
      return {
        id: row.id,
        connectionId: row.connection_id,
        tableName: row.table_name,
        tableComment: row.table_comment,
        columnCount: row.column_count,
        syncedAt: row.synced_at,
        importable: compatibility.importable,
        importMessage: compatibility.importMessage,
      };
    }),
    total,
    page,
    pageSize,
  };
}

export async function getSyncedTable(id: number) {
  const row = await repo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '同步表信息不存在');
  const info = tableInfoFromRow(row);
  const compatibility = evaluateImportable(info);
  return {
    id: row.id,
    connectionId: row.connection_id,
    tableName: row.table_name,
    tableComment: row.table_comment,
    columnCount: row.column_count,
    syncedAt: row.synced_at,
    importable: compatibility.importable,
    importMessage: compatibility.importMessage,
    columns: info.columns,
  };
}

export async function findSyncedTable(connectionId: number, tableName: string): Promise<DevDbTable | null> {
  return repo().findOneBy({ connection_id: connectionId, table_name: tableName });
}
