import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

/**
 * 环境变量在这里一次性校验完毕：启动时暴露配置错误，
 * 比运行到某个接口才发现缺少 JWT_SECRET 更容易定位。
 */
const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default('*'),

  // 默认 PostgreSQL（Docker Compose），本地快速试用可切 sqlite
  DB_TYPE: z.enum(['mysql', 'postgres', 'sqlite']).default('postgres'),
  DB_HOST: z.string().default('127.0.0.1'),
  // 端口按 DB_TYPE 推导：postgres 5432 / mysql 3306
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_USERNAME: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_DATABASE: z.string().default('admin_base'),
  DB_SQLITE_PATH: z.string().default('data/dev.sqlite'),
  DB_LOGGING: booleanString.default('false'),

  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ADMIN_AUDIENCE: z.string().default('admin'),
  JWT_APP_AUDIENCE: z.string().default('app'),
  // 数据源密码加密密钥；不配置时沿用 JWT_SECRET，生产建议单独设置
  DATA_SOURCE_SECRET: z.string().min(16).optional(),

  UPLOAD_DIR: z.string().default('uploads'),
  /** 旧的单次上传接口的大小上限，分片上传走 UPLOAD_MAX_FILE_SIZE_MB */
  UPLOAD_MAX_SIZE_MB: z.coerce.number().int().min(1).max(100).default(10),
  /** 分片大小（MB）：前端未指定时按此值切分，单请求体也据此限制 */
  UPLOAD_CHUNK_SIZE_MB: z.coerce.number().int().min(1).max(32).default(5),
  /** 分片上传允许的单文件大小上限（MB） */
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(10240).default(2048),

  SEED_ADMIN_PASSWORD: z.string().min(8).default('KEEL@123456'),
  /** 演示账户 demo 的初始密码，仅首次创建时生效 */
  SEED_DEMO_PASSWORD: z.string().min(8).default('Demo@123456'),

  WECHAT_APPID: z.string().default(''),
  WECHAT_SECRET: z.string().default(''),
  WECHAT_MOCK: booleanString.default('true'),

  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('环境变量校验失败：', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const defaultDbPort = env.DB_TYPE === 'postgres' ? 5432 : env.DB_TYPE === 'mysql' ? 3306 : 0;

export const config = {
  ...env,
  DB_PORT: env.DB_PORT ?? defaultDbPort,
  DATA_SOURCE_SECRET: env.DATA_SOURCE_SECRET ?? env.JWT_SECRET,
  isProd: env.NODE_ENV === 'production',
  /** 相对路径统一按 server 目录解析，避免从不同 cwd 启动时落到别处 */
  resolvePath(value: string): string {
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  },
};

export type AppConfig = typeof config;
