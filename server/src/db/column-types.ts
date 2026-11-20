import { config } from '../config';

/**
 * 可空日期列需要显式给 type。Postgres 不接受 datetime，
 * SQLite / MySQL 不接受 timestamp 的语义差异也用这里统一抹平。
 */
export const DATE_TIME_COLUMN_TYPE: 'datetime' | 'timestamp' =
  config.DB_TYPE === 'postgres' ? 'timestamp' : 'datetime';
