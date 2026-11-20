import { AppDataSource } from '../../db/data-source';
import { SysDictData, SysDictType } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import type {
  CreateDictDataInput,
  CreateDictTypeInput,
  DictDataQuery,
  DictTypeQuery,
  UpdateDictDataInput,
  UpdateDictTypeInput,
} from './dict.dto';

function typeRepo() {
  return AppDataSource.getRepository(SysDictType);
}

function dataRepo() {
  return AppDataSource.getRepository(SysDictData);
}

export interface DictDataDto {
  id: number;
  dictType: string;
  dictLabel: string;
  dictValue: string;
  dictSort: number;
  tagType: string;
  status: string;
  remark: string | null;
}

function toDataDto(row: SysDictData): DictDataDto {
  return {
    id: row.id,
    dictType: row.dict_type,
    dictLabel: row.dict_label,
    dictValue: row.dict_value,
    dictSort: row.dict_sort,
    tagType: row.tag_type,
    status: row.status,
    remark: row.remark,
  };
}

function toTypeDto(row: SysDictType) {
  return {
    id: row.id,
    dictName: row.dict_name,
    dictType: row.dict_type,
    status: row.status,
    remark: row.remark,
    createdAt: row.createdAt,
  };
}

/** 字典选项缓存：60 秒，写操作立即失效；多实例部署需换 Redis 或广播失效 */
let optionsCache: { data: Record<string, DictDataDto[]>; expiresAt: number } | null = null;
const OPTIONS_TTL_MS = 60 * 1000;

function invalidateCache(): void {
  optionsCache = null;
}

export async function listDictTypes(query: DictTypeQuery) {
  const { page, pageSize, keyword, status } = query;
  const qb = typeRepo()
    .createQueryBuilder('type')
    .orderBy('type.id', 'ASC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (keyword) {
    qb.andWhere('(type.dict_name LIKE :keyword OR type.dict_type LIKE :keyword)', {
      keyword: `%${keyword}%`,
    });
  }
  if (status) qb.andWhere('type.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toTypeDto), total, page, pageSize };
}

export async function listDictTypeOptions() {
  const rows = await typeRepo().find({
    where: { status: 'ENABLED' },
    order: { id: 'ASC' },
  });
  return rows.map((row) => ({ id: row.id, dictName: row.dict_name, dictType: row.dict_type }));
}

export async function createDictType(input: CreateDictTypeInput) {
  const exists = await typeRepo().findOne({ where: { dict_type: input.dictType }, withDeleted: true });
  if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '字典类型已存在');

  const row = typeRepo().create({
    dict_name: input.dictName,
    dict_type: input.dictType,
    status: input.status,
    remark: input.remark ?? null,
  });
  await typeRepo().save(row);
  invalidateCache();
  return toTypeDto(row);
}

export async function updateDictType(id: number, input: UpdateDictTypeInput) {
  const row = await typeRepo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '字典类型不存在');

  const patch = {
    ...(input.dictName !== undefined ? { dict_name: input.dictName } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.remark !== undefined ? { remark: input.remark ?? null } : {}),
  };
  if (Object.keys(patch).length > 0) await typeRepo().update(id, patch);
  invalidateCache();
  return toTypeDto((await typeRepo().findOneBy({ id }))!);
}

export async function deleteDictType(id: number) {
  const row = await typeRepo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '字典类型不存在');

  // 字典类型和数据必须一起删除，否则会留下无主的字典项
  await AppDataSource.transaction(async (manager) => {
    await manager.delete(SysDictData, { dict_type: row.dict_type });
    await manager.delete(SysDictType, { id });
  });
  invalidateCache();
}

function assertTypeExists(dictType: string): Promise<boolean> {
  return typeRepo().existsBy({ dict_type: dictType });
}

export async function listDictData(query: DictDataQuery) {
  const { page, pageSize, dictType, label, status } = query;
  const qb = dataRepo()
    .createQueryBuilder('data')
    .orderBy('data.dict_type', 'ASC')
    .addOrderBy('data.dict_sort', 'ASC')
    .addOrderBy('data.id', 'ASC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (dictType) qb.andWhere('data.dict_type = :dictType', { dictType });
  if (label) qb.andWhere('data.dict_label LIKE :label', { label: `%${label}%` });
  if (status) qb.andWhere('data.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toDataDto), total, page, pageSize };
}

export async function createDictData(input: CreateDictDataInput) {
  if (!(await assertTypeExists(input.dictType))) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, '字典类型不存在');
  }
  const exists = await dataRepo().findOne({
    where: { dict_type: input.dictType, dict_value: input.dictValue },
    withDeleted: true,
  });
  if (exists) throw new AppError(ERROR_CODES.VALIDATION_FAILED, '同一字典下数据值不能重复');

  const row = dataRepo().create({
    dict_type: input.dictType,
    dict_label: input.dictLabel,
    dict_value: input.dictValue,
    dict_sort: input.dictSort,
    tag_type: input.tagType,
    status: input.status,
    remark: input.remark ?? null,
  });
  await dataRepo().save(row);
  invalidateCache();
  return toDataDto(row);
}

export async function updateDictData(id: number, input: UpdateDictDataInput) {
  const row = await dataRepo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '字典数据不存在');

  if (input.dictValue && input.dictValue !== row.dict_value) {
    const exists = await dataRepo().findOne({
      where: { dict_type: row.dict_type, dict_value: input.dictValue },
      withDeleted: true,
    });
    if (exists && exists.id !== id) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, '同一字典下数据值不能重复');
    }
  }

  const patch = {
    ...(input.dictLabel !== undefined ? { dict_label: input.dictLabel } : {}),
    ...(input.dictValue !== undefined ? { dict_value: input.dictValue } : {}),
    ...(input.dictSort !== undefined ? { dict_sort: input.dictSort } : {}),
    ...(input.tagType !== undefined ? { tag_type: input.tagType } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.remark !== undefined ? { remark: input.remark ?? null } : {}),
  };
  if (Object.keys(patch).length > 0) await dataRepo().update(id, patch);
  invalidateCache();
  return toDataDto((await dataRepo().findOneBy({ id }))!);
}

export async function deleteDictData(id: number) {
  const row = await dataRepo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '字典数据不存在');
  await dataRepo().delete({ id });
  invalidateCache();
}

export async function getAllDictOptions(): Promise<Record<string, DictDataDto[]>> {
  if (optionsCache && optionsCache.expiresAt > Date.now()) return optionsCache.data;

  const rows = await dataRepo().find({
    where: { status: 'ENABLED' },
    order: { dict_type: 'ASC', dict_sort: 'ASC', id: 'ASC' },
  });
  const grouped: Record<string, DictDataDto[]> = {};
  for (const row of rows) {
    (grouped[row.dict_type] ??= []).push(toDataDto(row));
  }
  optionsCache = { data: grouped, expiresAt: Date.now() + OPTIONS_TTL_MS };
  return grouped;
}
