import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { config } from '../config';
import { loadBizEntities } from '../biz';
import { entities } from './entities';

function buildOptions(): DataSourceOptions {
  const shared = {
    // 系统实体显式声明；业务实体由 server/src/biz 自动发现
    entities: [...entities, ...loadBizEntities()],
    synchronize: !config.isProd,
    logging: config.DB_LOGGING,
    migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
    migrationsTableName: 'migrations',
  };

  if (config.DB_TYPE === 'sqlite') {
    const file = config.resolvePath(config.DB_SQLITE_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return { ...shared, type: 'better-sqlite3', database: file };
  }

  if (config.DB_TYPE === 'postgres') {
    return {
      ...shared,
      type: 'postgres',
      host: config.DB_HOST,
      port: config.DB_PORT,
      username: config.DB_USERNAME,
      password: config.DB_PASSWORD,
      database: config.DB_DATABASE,
    };
  }

  return {
    ...shared,
    type: 'mysql',
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    database: config.DB_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z',
  };
}

export const AppDataSource = new DataSource(buildOptions());
