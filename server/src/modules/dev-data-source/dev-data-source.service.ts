import { Not } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { DevDataSource, DevDbTable, DevModel } from '../../db/entities';
import type { AuthContext } from '../../types/express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { encryptSecret } from '../../utils/secret';
import type {
  CreateDataSourceInput,
  DataSourceQuery,
  UpdateDataSourceInput,
} from './dev-data-source.dto';
import { syncDataSourceTables } from '../dev-db-table/dev-db-table.service';
import { listDatabaseTables, testDataSource } from './data-source.client';

function repo() {
  return AppDataSource.getRepository(DevDataSource);
}

function modelRepo() {
  return AppDataSource.getRepository(DevModel);
}

function toDto(row: DevDataSource) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    dbType: row.db_type,
    host: row.host,
    port: row.port,
    databaseName: row.database_name,
    username: row.username,
    hasPassword: Boolean(row.password_encrypted),
    status: row.status,
    isDefault: row.is_default,
    remark: row.remark,
    lastTestAt: row.last_test_at,
    lastTestStatus: row.last_test_status,
    lastTestMessage: row.last_test_message,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOrFail(id: number): Promise<DevDataSource> {
  const row = await repo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '数据连接不存在');
  return row;
}

export async function listDataSources(query: DataSourceQuery) {
  const { page, pageSize, keyword, dbType, status } = query;
  const qb = repo()
    .createQueryBuilder('source')
    // 默认连接排在最前，列表和下拉都先看到它
    .orderBy('source.is_default', 'DESC')
    .addOrderBy('source.updatedAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(source.name LIKE :keyword OR source.code LIKE :keyword OR source.host LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (dbType) qb.andWhere('source.db_type = :dbType', { dbType });
  if (status) qb.andWhere('source.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toDto), total, page, pageSize };
}

export async function listDataSourceOptions() {
  const rows = await repo().find({ order: { is_default: 'DESC', id: 'ASC' } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    dbType: row.db_type,
    databaseName: row.database_name,
    status: row.status,
    isDefault: row.is_default,
  }));
}

export async function getDataSource(id: number) {
  return toDto(await findOrFail(id));
}

export async function createDataSource(input: CreateDataSourceInput, _operator: AuthContext) {
  const exists = await repo().findOne({ where: { code: input.code }, withDeleted: true });
  if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '连接编码已存在');

  const port = input.port ?? (input.dbType === 'mysql' ? 3306 : 5432);
  const hasDefault = await repo().exists({ where: { is_default: true } });
  // 第一条连接自动成为默认，后续新建必须显式勾选
  const isDefault = input.isDefault === true || !hasDefault;

  const row = await AppDataSource.transaction(async (manager) => {
    if (isDefault) {
      await manager.createQueryBuilder().update(DevDataSource).set({ is_default: false }).execute();
    }
    const entity = manager.create(DevDataSource, {
      name: input.name,
      code: input.code,
      db_type: input.dbType,
      host: input.host,
      port,
      database_name: input.databaseName,
      username: input.username,
      password_encrypted: encryptSecret(input.password ?? ''),
      status: input.status,
      is_default: isDefault,
      remark: input.remark ?? null,
      last_test_at: null,
      last_test_status: null,
      last_test_message: null,
    });
    await manager.save(entity);
    return entity;
  });
  return toDto(row);
}

export async function updateDataSource(
  id: number,
  input: UpdateDataSourceInput,
  _operator: AuthContext,
) {
  const current = await findOrFail(id);

  const patch: Partial<DevDataSource> = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.host !== undefined ? { host: input.host } : {}),
    ...(input.port !== undefined ? { port: input.port } : {}),
    ...(input.databaseName !== undefined ? { database_name: input.databaseName } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.remark !== undefined ? { remark: input.remark ?? null } : {}),
  };
  // 留空表示不修改密码
  if (input.password) patch.password_encrypted = encryptSecret(input.password);

  await AppDataSource.transaction(async (manager) => {
    if (input.isDefault === true) {
      await manager.createQueryBuilder().update(DevDataSource).set({ is_default: false }).execute();
      patch.is_default = true;
    } else if (input.isDefault === false && current.is_default) {
      // 默认连接必须始终存在：关闭当前默认时把默认转给另一条连接
      const other = await manager.getRepository(DevDataSource).findOne({
        where: { id: Not(id) },
        order: { id: 'ASC' },
      });
      if (other) {
        await manager.update(DevDataSource, other.id, { is_default: true });
        patch.is_default = false;
      } else {
        patch.is_default = true;
      }
    }
    await manager.update(DevDataSource, id, patch);
  });
  return getDataSource(id);
}

export async function deleteDataSource(id: number) {
  const current = await findOrFail(id);
  const modelCount = await modelRepo().count({ where: { connection_id: id } });
  if (modelCount > 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该连接下仍有数据模型，请先删除模型');
  }
  // 同步的库表元数据跟随连接一起清理，避免孤儿数据
  await AppDataSource.transaction(async (manager) => {
    await manager.delete(DevDbTable, { connection_id: id });
    await manager.delete(DevDataSource, { id });
  });

  if (current.is_default) {
    const next = await repo().findOne({ order: { id: 'ASC' } });
    if (next) await repo().update(next.id, { is_default: true });
  }
}

/**
 * 老库升级后可能没有任何默认连接，启动时补一条，保证所有下拉都有默认值。
 * 只在启动阶段执行，不覆盖用户主动设置的默认连接。
 */
export async function ensureDefaultDataSource(): Promise<void> {
  const total = await repo().count();
  if (total === 0) return;
  const defaultCount = await repo().count({ where: { is_default: true } });
  if (defaultCount > 0) return;

  const firstEnabled = await repo().findOne({
    where: { status: 'ENABLED' },
    order: { id: 'ASC' },
  });
  const first = firstEnabled ?? (await repo().findOne({ order: { id: 'ASC' } }));
  if (first) await repo().update(first.id, { is_default: true });
}

export async function testDataSourceConnection(id: number) {
  const source = await findOrFail(id);
  const result = await testDataSource(source);

  let syncedTables = 0;
  let message = result.message;
  if (result.ok) {
    try {
      // 连接成功后自动把库表/字段元数据同步到本地，供数据建模使用
      syncedTables = await syncDataSourceTables(source);
    } catch (error) {
      message = `${message}，但同步表结构失败：${
        error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 200) : '未知错误'
      }`;
    }
  }

  await repo().update(id, {
    last_test_at: new Date(),
    last_test_status: result.ok ? 'SUCCESS' : 'FAILED',
    last_test_message: message.slice(0, 500),
  });
  return { ...result, message, syncedTables };
}

export async function syncDataSourceTablesById(id: number) {
  const source = await findOrFail(id);
  return syncDataSourceTables(source);
}

export async function getDataSourceTables(id: number) {
  const source = await findOrFail(id);
  return listDatabaseTables(source);
}
