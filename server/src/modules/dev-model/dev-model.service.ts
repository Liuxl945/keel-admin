import { IsNull } from 'typeorm';
import { z } from 'zod';
import { AppDataSource } from '../../db/data-source';
import { DevDataSource, DevModel } from '../../db/entities';
import type { AuthContext } from '../../types/express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { buildCodeArchive } from '../../utils/code-archive';
import { executeStatements } from '../dev-data-source/data-source.client';
import { evaluateImportable } from '../dev-db-table/dev-db-table.introspect';
import {
  findSyncedTable,
  syncDataSourceTables,
  tableInfoFromRow,
} from '../dev-db-table/dev-db-table.service';
import { generateDevModelCode } from './dev-model.codegen';
import { buildPublishPlan } from './dev-model.publish';
import {
  devModelFieldSchema,
  type DevModelFieldInput,
  type DevModelQuery,
  type DevModelSchemaInput,
  type ImportExistingModelInput,
  type UpdateDevModelInput,
} from './dev-model.dto';

function repo() {
  return AppDataSource.getRepository(DevModel);
}

function connectionRepo() {
  return AppDataSource.getRepository(DevDataSource);
}

const RESERVED_TABLE = /^(sys_|dev_|operation_logs$|login_logs$|members$|uploaded_files$|migrations$)/;

function parseFields(row: DevModel): DevModelFieldInput[] {
  try {
    const parsed = z.array(devModelFieldSchema).safeParse(JSON.parse(row.fields_json));
    if (!parsed.success) throw new Error('invalid fields');
    return parsed.data;
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '模型字段配置已损坏，请重新编辑保存');
  }
}

function assertSafeTable(tableName: string): void {
  if (RESERVED_TABLE.test(tableName)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '表名不能使用系统保留前缀');
  }
}

// 展示类标记（列表/表单/搜索）不属于建表结构，比较时忽略，避免无意义地回到草稿
function schemaSignature(fields: DevModelFieldInput[]): string {
  return JSON.stringify(
    fields.map((field) => ({
      label: field.label,
      columnName: field.columnName,
      fieldName: field.fieldName,
      type: field.type,
      length: field.length,
      precision: field.precision,
      scale: field.scale,
      nullable: field.nullable,
    })),
  );
}

function toSummary(row: DevModel, connection?: DevDataSource | null) {
  return {
    id: row.id,
    name: row.name,
    modelKey: row.model_key,
    connectionId: row.connection_id,
    connectionName: connection?.name ?? null,
    dbType: connection?.db_type ?? null,
    tableName: row.table_name,
    publishedTableName: row.published_table_name,
    tableComment: row.table_comment,
    status: row.status,
    createdTableAt: row.created_table_at,
    updatedBy: row.updated_by,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: DevModel, connection: DevDataSource | null) {
  return {
    ...toSummary(row, connection),
    connection: connection
      ? {
          id: connection.id,
          name: connection.name,
          dbType: connection.db_type,
          databaseName: connection.database_name,
          status: connection.status,
        }
      : null,
    fields: parseFields(row),
  };
}

async function findOrFail(id: number): Promise<DevModel> {
  const row = await repo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '数据模型不存在');
  return row;
}

async function findConnectionOrFail(id: number): Promise<DevDataSource> {
  const connection = await connectionRepo().findOneBy({ id });
  if (!connection) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据连接不存在');
  return connection;
}

async function assertUnique(
  modelKey: string,
  connectionId: number,
  tableName: string,
  excludeId?: number,
): Promise<void> {
  const keyExists = await repo().findOne({ where: { model_key: modelKey }, withDeleted: true });
  if (keyExists && keyExists.id !== excludeId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '模型编码已存在');
  }
  const tableExistsRow = await repo().findOne({
    where: { connection_id: connectionId, table_name: tableName },
    withDeleted: true,
  });
  if (tableExistsRow && tableExistsRow.id !== excludeId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该连接下已存在同名表模型');
  }
  // 草稿改了表名后，旧表仍占用 published_table_name，其他模型不能抢占
  const publishedExistsRow = await repo().findOne({
    where: { connection_id: connectionId, published_table_name: tableName },
    withDeleted: true,
  });
  if (publishedExistsRow && publishedExistsRow.id !== excludeId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该连接下已存在同名已发布表');
  }
}

export async function listDevModels(query: DevModelQuery) {
  const { page, pageSize, keyword, status, connectionId } = query;
  const qb = repo()
    .createQueryBuilder('model')
    .orderBy('model.updatedAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(model.name LIKE :keyword OR model.model_key LIKE :keyword OR model.table_name LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (status) qb.andWhere('model.status = :status', { status });
  if (connectionId) qb.andWhere('model.connection_id = :connectionId', { connectionId });

  const [rows, total] = await qb.getManyAndCount();
  const connections = await connectionRepo().find();
  const map = new Map(connections.map((connection) => [connection.id, connection]));
  return {
    list: rows.map((row) => toSummary(row, map.get(row.connection_id))),
    total,
    page,
    pageSize,
  };
}

export async function getDevModel(id: number) {
  const row = await findOrFail(id);
  const connection = await connectionRepo().findOneBy({ id: row.connection_id });
  return toDetail(row, connection);
}

export async function createDevModel(input: DevModelSchemaInput, operator: AuthContext) {
  assertSafeTable(input.tableName);
  await findConnectionOrFail(input.connectionId);
  await assertUnique(input.modelKey, input.connectionId, input.tableName);

  const row = repo().create({
    name: input.name,
    model_key: input.modelKey,
    connection_id: input.connectionId,
    table_name: input.tableName,
    published_table_name: null,
    table_comment: input.tableComment ?? null,
    fields_json: JSON.stringify(input.fields),
    status: 'DRAFT',
    created_table_at: null,
    updated_by: operator.username,
  });
  await repo().save(row);
  const connection = await connectionRepo().findOneBy({ id: row.connection_id });
  return toDetail(row, connection);
}

function toCamel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.charAt(0).toLowerCase() + part.slice(1) : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** 把已同步的数据库表导入为模型：表已存在，直接生成 CREATED 状态的模型 */
export async function importExistingModel(
  input: ImportExistingModelInput,
  operator: AuthContext,
) {
  assertSafeTable(input.tableName);
  const connection = await findConnectionOrFail(input.connectionId);
  await assertUnique(input.modelKey, input.connectionId, input.tableName);

  const synced = await findSyncedTable(input.connectionId, input.tableName);
  if (!synced) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该表尚未同步，请先到数据连接测试或同步表结构');
  }

  const info = tableInfoFromRow(synced);
  const compatibility = evaluateImportable(info);
  if (!compatibility.importable) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `该表暂不支持导入：${compatibility.importMessage ?? '结构不兼容'}`,
    );
  }

  const systemColumns = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);
  const usedFieldNames = new Set<string>();
  const fields: DevModelFieldInput[] = [];

  for (const column of info.columns) {
    if (systemColumns.has(column.columnName)) continue;
    if (!column.type || !column.supported) continue;

    let fieldName = toCamel(column.columnName) || 'field';
    let index = 2;
    while (usedFieldNames.has(fieldName)) {
      fieldName = `${toCamel(column.columnName)}${index}`;
      index += 1;
    }
    usedFieldNames.add(fieldName);

    fields.push({
      label: column.comment || column.columnName,
      columnName: column.columnName,
      fieldName,
      type: column.type,
      length: column.length || 255,
      precision: column.precision || 10,
      scale: column.scale ?? 2,
      nullable: column.nullable,
      unique: false,
      listVisible: true,
      formVisible: true,
      searchable: ['varchar', 'text'].includes(column.type),
    });
  }

  if (fields.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '该表只有系统字段，没有可导入的业务字段');
  }

  const row = repo().create({
    name: input.name,
    model_key: input.modelKey,
    connection_id: input.connectionId,
    table_name: input.tableName,
    published_table_name: input.tableName,
    table_comment: info.tableComment || null,
    fields_json: JSON.stringify(fields),
    status: 'CREATED',
    created_table_at: new Date(),
    updated_by: operator.username,
  });
  await repo().save(row);
  return toDetail(row, connection);
}

export async function updateDevModel(
  id: number,
  input: UpdateDevModelInput,
  operator: AuthContext,
) {
  const row = await findOrFail(id);

  const connectionChanged =
    input.connectionId !== undefined && input.connectionId !== row.connection_id;
  if (row.created_table_at && connectionChanged) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      '表已发布，不能修改数据连接；如需换库请新建模型',
    );
  }

  const nextTableName = input.tableName ?? row.table_name;
  const nextConnectionId = input.connectionId ?? row.connection_id;
  if (input.tableName !== undefined) assertSafeTable(nextTableName);
  if (input.tableName !== undefined || input.connectionId !== undefined) {
    await findConnectionOrFail(nextConnectionId);
    await assertUnique(row.model_key, nextConnectionId, nextTableName, id);
  }

  // 已发布模型改了结构先回到草稿，点「发布」才真正执行 ALTER
  const schemaChanged =
    (input.fields !== undefined && schemaSignature(input.fields) !== schemaSignature(parseFields(row))) ||
    (input.tableName !== undefined && input.tableName !== row.table_name) ||
    (input.tableComment !== undefined && (input.tableComment ?? null) !== row.table_comment);

  const patch: Partial<DevModel> = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.connectionId !== undefined ? { connection_id: input.connectionId } : {}),
    ...(input.tableName !== undefined ? { table_name: input.tableName } : {}),
    ...(input.tableComment !== undefined ? { table_comment: input.tableComment ?? null } : {}),
    ...(input.fields !== undefined ? { fields_json: JSON.stringify(input.fields) } : {}),
    ...(schemaChanged && row.status === 'CREATED' ? { status: 'DRAFT' as const } : {}),
    updated_by: operator.username,
  };

  await repo().update(id, patch);
  return getDevModel(id);
}

export async function deleteDevModel(id: number) {
  await findOrFail(id);
  await repo().delete({ id });
}

export async function previewDevModelDdl(id: number) {
  const row = await findOrFail(id);
  const connection = await findConnectionOrFail(row.connection_id);
  const fields = parseFields(row);
  if (fields.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先设计至少一个字段');
  }
  return buildPublishPlan(connection, row, fields);
}

export async function publishDevModel(id: number, operator: AuthContext) {
  const row = await findOrFail(id);
  const connection = await findConnectionOrFail(row.connection_id);
  if (connection.status !== 'ENABLED') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '数据连接已禁用，请先启用');
  }

  assertSafeTable(row.table_name);
  const fields = parseFields(row);
  if (fields.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先设计至少一个字段');
  }

  const plan = await buildPublishPlan(connection, row, fields);
  if (plan.statements.length > 0) {
    try {
      await executeStatements(connection, plan.statements);
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/\s+/g, ' ').slice(0, 300) : '未知错误';
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `发布失败：${message}`);
    }
  }

  await repo().update(id, {
    status: 'CREATED',
    published_table_name: row.table_name,
    created_table_at: row.created_table_at ?? new Date(),
    updated_by: operator.username,
  });

  // 发布后刷新库表元数据，表单设计器能立即看到新表/新字段
  try {
    await syncDataSourceTables(connection);
  } catch {
    // 同步失败不影响已经成功的建表/改表
  }

  return getDevModel(id);
}

/** 老库升级后补齐已发布表名，后续才能识别重命名 */
export async function ensurePublishedTableNames(): Promise<void> {
  const rows = await repo().find({ where: { published_table_name: IsNull() } });
  const legacy = rows.filter((row) => row.created_table_at !== null);
  for (const row of legacy) {
    await repo().update(row.id, { published_table_name: row.table_name });
  }
}

export async function getDevModelCode(id: number) {
  const row = await findOrFail(id);
  const connection = await findConnectionOrFail(row.connection_id);
  const fields = parseFields(row);
  if (fields.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请先设计至少一个字段');
  }
  return {
    formId: row.id,
    formKey: row.model_key,
    formName: row.name,
    status: row.status,
    version: 1,
    generatedAt: new Date(),
    files: generateDevModelCode(row, connection, fields),
  };
}

/** 同表单：生成后按 server/ 与 admin/ 目录结构打包成 zip */
export async function getDevModelCodeArchive(id: number) {
  const result = await getDevModelCode(id);
  return buildCodeArchive(result.files, result.formKey);
}
