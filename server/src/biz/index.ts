import fs from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import { getMetadataArgsStorage } from 'typeorm';
import { BaseEntity } from '../db/entities/base.entity';

/**
 * 业务代码目录约定：`server/src/biz/<模块>/`，模块内固定两个约定文件名
 * - `<模块>.entity.ts`：TypeORM 实体，启动时自动并入 entities
 * - `<模块>.route.ts`：Express Router，启动时自动挂到 /api/admin/<模块>
 *
 * 这样代码生成下载解压后不用再改 app.ts / entities/index.ts，
 * 复制进目录重启即生效。新增业务模块也不需要改框架代码。
 */
const BIZ_DIR = __dirname;

function bizDirs(): string[] {
  if (!fs.existsSync(BIZ_DIR)) return [];
  return fs
    .readdirSync(BIZ_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => path.join(BIZ_DIR, entry.name))
    .sort();
}

/** 开发态是 .ts，编译后是 .js，两种都认 */
function pickFile(dir: string, base: string, suffix: string): string | null {
  for (const ext of ['.ts', '.js']) {
    const file = path.join(dir, `${base}${suffix}${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function requireModule(file: string): Record<string, unknown> {
  try {
    // 动态路径无法静态分析，这里必须用 require
    return require(file) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`业务模块加载失败（${file}）：${(error as Error).message}`);
  }
}

function isEntity(value: unknown): value is Function {
  if (typeof value !== 'function') return false;
  if (value.prototype instanceof BaseEntity) return true;
  return getMetadataArgsStorage().tables.some((table) => table.target === value);
}

/** express.Router 本身是函数，靠 use/handle 做鸭子类型判断 */
function isRouter(value: unknown): value is Router {
  if (typeof value !== 'function') return false;
  const candidate = value as unknown as { use?: unknown; handle?: unknown };
  return typeof candidate.use === 'function' && typeof candidate.handle === 'function';
}

/** 扫描 biz 目录，返回需要注册到 DataSource 的实体类 */
export function loadBizEntities(): Function[] {
  const entities: Function[] = [];
  for (const dir of bizDirs()) {
    const file = pickFile(dir, path.basename(dir), '.entity');
    if (!file) continue;
    for (const value of Object.values(requireModule(file))) {
      if (isEntity(value) && !entities.includes(value)) entities.push(value);
    }
  }
  return entities;
}

export interface BizRouterEntry {
  basePath: string;
  router: Router;
}

/** 扫描 biz 目录，返回需要挂载的路由（basePath 为 /<模块名>） */
export function loadBizRouters(): BizRouterEntry[] {
  const routers: BizRouterEntry[] = [];
  for (const dir of bizDirs()) {
    const name = path.basename(dir);
    const file = pickFile(dir, name, '.route');
    if (!file) continue;
    for (const value of Object.values(requireModule(file))) {
      if (isRouter(value)) routers.push({ basePath: `/${name}`, router: value });
    }
  }
  return routers;
}
