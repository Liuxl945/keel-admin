import { AppDataSource } from './data-source';
import { seed } from './seed';
import { logger } from '../utils/logger';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  await seed();
  await AppDataSource.destroy();
}

main().catch(async (err) => {
  logger.error({ err }, '种子数据执行失败');
  process.exitCode = 1;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
});
