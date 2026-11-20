import { AppDataSource } from '../../db/data-source';
import { SystemConfig } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import {
  CONFIG_DEFINITIONS,
  PUBLIC_CONFIG_KEYS,
  type ConfigKey,
  type ConfigDefinition,
} from './config.constants';

function configRepo() {
  return AppDataSource.getRepository(SystemConfig);
}

const definitionMap = new Map<string, ConfigDefinition>(
  CONFIG_DEFINITIONS.map((definition) => [definition.key, definition]),
);

/** 幂等补齐缺失的配置行，不覆盖已有值 */
export async function ensureConfigRows(): Promise<void> {
  const existing = await configRepo().find({ select: { key: true } });
  const existingKeys = new Set(existing.map((row) => row.key));
  const missing = CONFIG_DEFINITIONS.filter((definition) => !existingKeys.has(definition.key));
  if (missing.length === 0) return;

  await configRepo().insert(
    missing.map((definition) => ({
      key: definition.key,
      value: definition.value,
      name: definition.name,
      description: definition.description,
      category: definition.category,
    })),
  );
}

export async function getConfigValue(key: ConfigKey, fallback = ''): Promise<string> {
  const row = await configRepo().findOneBy({ key });
  return row?.value ?? definitionMap.get(key)?.value ?? fallback;
}

export async function getPublicConfigs(): Promise<Record<string, string>> {
  const rows = await configRepo().find();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const result: Record<string, string> = {};
  for (const key of PUBLIC_CONFIG_KEYS) {
    result[key] = values.get(key) ?? definitionMap.get(key)?.value ?? '';
  }
  return result;
}

export async function listConfigs() {
  const rows = await configRepo().find({ order: { category: 'ASC', id: 'ASC' } });
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    name: row.name,
    description: row.description,
    category: row.category,
    updatedAt: row.updatedAt,
  }));
}

export async function updateConfigs(items: Array<{ key: string; value: string }>) {
  for (const item of items) {
    const definition = definitionMap.get(item.key);
    if (!definition) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `未知的配置项：${item.key}`);
    }
  }

  for (const item of items) {
    const definition = definitionMap.get(item.key)!;
    const existing = await configRepo().findOneBy({ key: item.key });
    if (existing) {
      await configRepo().update(existing.id, { value: item.value });
    } else {
      await configRepo().insert({
        key: definition.key,
        value: item.value,
        name: definition.name,
        description: definition.description,
        category: definition.category,
      });
    }
  }

  return listConfigs();
}
