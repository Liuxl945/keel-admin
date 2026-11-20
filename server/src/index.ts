import { createApp } from './app';
import { config } from './config';
import { AppDataSource } from './db/data-source';
import { runSeedIfNeeded } from './db/seed';
import { ensureDefaultDataSource } from './modules/dev-data-source/dev-data-source.service';
import { ensurePublishedTableNames } from './modules/dev-model/dev-model.service';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  logger.info({ dbType: config.DB_TYPE }, '数据库连接成功');

  await runSeedIfNeeded();
  await ensureDefaultDataSource();
  await ensurePublishedTableNames();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`API 服务已启动：http://localhost:${config.PORT}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`收到 ${signal}，正在退出`);
    server.close();
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, '服务启动失败');
  process.exit(1);
});
