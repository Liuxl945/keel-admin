import { AppDataSource } from '../../db/data-source';
import { DevApi } from '../../db/entities';
import type { AuthContext } from '../../types/express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import {
  devApiConfigSchema,
  type CreateDevApiInput,
  type DevApiConfig,
  type DevApiQuery,
  type RunDevApiInput,
  type UpdateDevApiInput,
} from './dev-api.dto';
import { runDevApi, validateApiDefinition, type RunDevApiResult } from './dev-api.runtime';

function repo() {
  return AppDataSource.getRepository(DevApi);
}

/** 空配置：创建静态/SQL 接口时由前端整体提交，这里只用于兜底解析旧数据 */
export const EMPTY_API_CONFIG: DevApiConfig = devApiConfigSchema.parse({});

function parseConfig(row: DevApi): DevApiConfig {
  try {
    const parsed = devApiConfigSchema.safeParse(JSON.parse(row.config_json) as unknown);
    if (!parsed.success) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `接口配置已损坏：${parsed.error.issues[0]?.message ?? '格式不正确'}`,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '接口配置 JSON 解析失败');
  }
}

function toSummary(row: DevApi) {
  return {
    id: row.id,
    name: row.name,
    apiKey: row.api_key,
    category: row.category,
    description: row.description,
    connectionId: row.connection_id,
    modelId: row.model_id,
    tableName: row.table_name,
    action: row.action,
    status: row.status,
    version: row.version,
    publishedAt: row.published_at,
    updatedBy: row.updated_by,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDetail(row: DevApi) {
  return { ...toSummary(row), config: parseConfig(row) };
}

async function findOrFail(id: number): Promise<DevApi> {
  const row = await repo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '数据接口不存在');
  return row;
}

async function assertUnique(apiKey: string, excludeId?: number): Promise<void> {
  const exists = await repo().findOne({ where: { api_key: apiKey }, withDeleted: true });
  if (exists && exists.id !== excludeId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '接口编码已存在');
  }
}

/** 保存前的完整定义校验：静态数据可解析，SQL 关联齐全且语句/标识符合法 */
async function assertDefinition(draft: DevApi, config: DevApiConfig): Promise<void> {
  if (draft.category === 'STATIC') {
    await validateApiDefinition(draft, config);
    return;
  }
  if (!draft.connection_id || !draft.model_id || !draft.table_name || !draft.action) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'SQL 接口必须配置数据连接、建模数据、目标表和动作');
  }
  if (!config.sql.trim()) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '请填写 SQL 模板');
  }
  await validateApiDefinition(draft, config);
}

export async function listDevApis(query: DevApiQuery) {
  const { page, pageSize, keyword, category, status, action, connectionId } = query;
  const qb = repo()
    .createQueryBuilder('api')
    .orderBy('api.updatedAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(api.name LIKE :keyword OR api.api_key LIKE :keyword OR api.description LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (category) qb.andWhere('api.category = :category', { category });
  if (status) qb.andWhere('api.status = :status', { status });
  if (action) qb.andWhere('api.action = :action', { action });
  if (connectionId) qb.andWhere('api.connection_id = :connectionId', { connectionId });

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toSummary), total, page, pageSize };
}

export async function getDevApi(id: number) {
  return toDetail(await findOrFail(id));
}

export async function createDevApi(input: CreateDevApiInput, operator: AuthContext) {
  await assertUnique(input.apiKey);
  const config = input.config ?? EMPTY_API_CONFIG;

  const row = repo().create({
    name: input.name,
    api_key: input.apiKey,
    category: input.category,
    description: input.description ?? null,
    connection_id: input.connectionId ?? null,
    model_id: input.modelId ?? null,
    table_name: input.tableName ?? null,
    action: input.action ?? null,
    config_json: JSON.stringify(config),
    status: 'DRAFT',
    version: 1,
    published_at: null,
    updated_by: operator.username,
  });
  await repo().save(row);
  return toDetail(row);
}

export async function updateDevApi(id: number, input: UpdateDevApiInput, operator: AuthContext) {
  const row = await findOrFail(id);
  const config = input.config ?? parseConfig(row);
  const draft: DevApi = {
    ...row,
    name: input.name ?? row.name,
    description: input.description === undefined ? row.description : input.description,
    connection_id: input.connectionId === undefined ? row.connection_id : input.connectionId,
    model_id: input.modelId === undefined ? row.model_id : input.modelId,
    table_name: input.tableName === undefined ? row.table_name : input.tableName,
    action: input.action === undefined ? row.action : input.action,
    status: input.status ?? row.status,
  } as DevApi;
  await assertDefinition(draft, config);

  const structureChanged =
    input.config !== undefined ||
    input.connectionId !== undefined ||
    input.modelId !== undefined ||
    input.tableName !== undefined ||
    input.action !== undefined;

  Object.assign(row, {
    name: draft.name,
    description: draft.description,
    connection_id: draft.connection_id,
    model_id: draft.model_id,
    table_name: draft.table_name,
    action: draft.action,
    config_json: JSON.stringify(config),
    // 已发布接口改了结构就回到草稿，避免线上版本与配置不一致
    status: structureChanged && row.status === 'PUBLISHED' ? 'DRAFT' : draft.status,
    updated_by: operator.username,
  });
  await repo().save(row);
  return toDetail(row);
}

export async function publishDevApi(id: number, operator: AuthContext) {
  const row = await findOrFail(id);
  await assertDefinition(row, parseConfig(row));
  const nextVersion = row.published_at ? row.version + 1 : row.version;
  await repo().update(id, {
    status: 'PUBLISHED',
    version: nextVersion,
    published_at: new Date(),
    updated_by: operator.username,
  });
  return toDetail(await findOrFail(id));
}

export async function deleteDevApi(id: number) {
  await findOrFail(id);
  await repo().softDelete(id);
}

export async function runDevApiById(id: number, input: RunDevApiInput): Promise<RunDevApiResult> {
  const row = await findOrFail(id);
  return runDevApi(row, parseConfig(row), input);
}
