import { In, type FindOptionsWhere } from 'typeorm';
import { AppDataSource } from '../../db/data-source';
import { LoginLog, OperationLog } from '../../db/entities';
import { parsePagination } from '../../utils/pagination';
import { normalizeDateBoundary } from '../../utils/date-range';

function operationLogRepo() {
  return AppDataSource.getRepository(OperationLog);
}

function loginLogRepo() {
  return AppDataSource.getRepository(LoginLog);
}

export interface CreateOperationLogInput {
  user_id: number | null;
  username: string | null;
  method: string;
  path: string;
  status_code: number;
  biz_code: number | null;
  duration_ms: number;
  ip: string | null;
  user_agent: string | null;
  query: string | null;
  body: string | null;
  response: string | null;
}

export async function createOperationLog(input: CreateOperationLogInput): Promise<void> {
  await operationLogRepo().insert(input);
}

export interface OperationLogQuery {
  page?: unknown;
  pageSize?: unknown;
  username?: string;
  path?: string;
  method?: string;
  startTime?: string;
  endTime?: string;
}

export async function listOperationLogs(query: OperationLogQuery) {
  const { page, pageSize } = parsePagination(query as Record<string, unknown>);
  const where: FindOptionsWhere<OperationLog> = {};

  if (query.username?.trim()) where.username = String(query.username).trim();
  if (query.path?.trim()) where.path = String(query.path).trim();
  if (query.method?.trim()) where.method = String(query.method).trim().toUpperCase();

  const qb = operationLogRepo()
    .createQueryBuilder('log')
    .select([
      'log.id',
      'log.user_id',
      'log.username',
      'log.method',
      'log.path',
      'log.status_code',
      'log.biz_code',
      'log.duration_ms',
      'log.ip',
      'log.user_agent',
      'log.createdAt',
    ])
    .orderBy('log.createdAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  const start = normalizeDateBoundary(query.startTime, 'start');
  const end = normalizeDateBoundary(query.endTime, 'end');
  if (start) qb.andWhere('log.created_at >= :start', { start });
  if (end) qb.andWhere('log.created_at <= :end', { end });
  if (where.username) qb.andWhere('log.username = :username', { username: where.username });
  if (where.path) qb.andWhere('log.path LIKE :path', { path: `%${where.path}%` });
  if (where.method) qb.andWhere('log.method = :method', { method: where.method });

  const [rows, total] = await qb.getManyAndCount();
  return {
    list: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      bizCode: row.biz_code,
      durationMs: row.duration_ms,
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getOperationLog(id: number) {
  const log = await operationLogRepo().findOneBy({ id });
  if (!log) return null;
  return {
    id: log.id,
    userId: log.user_id,
    username: log.username,
    method: log.method,
    path: log.path,
    statusCode: log.status_code,
    bizCode: log.biz_code,
    durationMs: log.duration_ms,
    ip: log.ip,
    userAgent: log.user_agent,
    query: log.query,
    body: log.body,
    response: log.response,
    createdAt: log.createdAt,
  };
}

export async function batchDeleteOperationLogs(ids: number[]): Promise<number> {
  const result = await operationLogRepo().delete({ id: In(ids) });
  return result.affected ?? 0;
}

export async function listOperationLogsForExport(query: OperationLogQuery) {
  const qb = operationLogRepo()
    .createQueryBuilder('log')
    .orderBy('log.createdAt', 'DESC')
    .take(5000);

  if (query.username?.trim()) {
    qb.andWhere('log.username = :username', { username: query.username.trim() });
  }
  if (query.path?.trim()) {
    qb.andWhere('log.path LIKE :path', { path: `%${query.path.trim()}%` });
  }
  if (query.method?.trim()) {
    qb.andWhere('log.method = :method', { method: query.method.trim().toUpperCase() });
  }
  const start = normalizeDateBoundary(query.startTime, 'start');
  const end = normalizeDateBoundary(query.endTime, 'end');
  if (start) qb.andWhere('log.created_at >= :start', { start });
  if (end) qb.andWhere('log.created_at <= :end', { end });

  const rows = await qb.getMany();
  return rows.map((row) => ({
    username: row.username ?? '',
    method: row.method,
    path: row.path,
    statusCode: row.status_code,
    bizCode: row.biz_code ?? '',
    durationMs: row.duration_ms,
    ip: row.ip ?? '',
    createdAt: row.createdAt,
  }));
}

export interface CreateLoginLogInput {
  user_id: number | null;
  username: string | null;
  user_type: 'ADMIN' | 'APP';
  success: boolean;
  message?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export async function createLoginLog(input: CreateLoginLogInput): Promise<void> {
  try {
    await loginLogRepo().insert({
      user_id: input.user_id,
      username: input.username,
      user_type: input.user_type,
      success: input.success,
      message: input.message ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    });
  } catch {
    // 登录日志失败不能阻断登录主流程
  }
}

export interface LoginLogQuery {
  page?: unknown;
  pageSize?: unknown;
  username?: string;
  userType?: string;
  success?: string;
  startTime?: string;
  endTime?: string;
}

export async function listLoginLogs(query: LoginLogQuery) {
  const { page, pageSize } = parsePagination(query as Record<string, unknown>);

  const qb = loginLogRepo()
    .createQueryBuilder('log')
    .orderBy('log.createdAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (query.username?.trim()) {
    qb.andWhere('log.username LIKE :username', { username: `%${query.username.trim()}%` });
  }
  if (query.userType === 'ADMIN' || query.userType === 'APP') {
    qb.andWhere('log.user_type = :userType', { userType: query.userType });
  }
  if (query.success === 'true' || query.success === 'false') {
    qb.andWhere('log.success = :success', { success: query.success === 'true' });
  }
  const start = normalizeDateBoundary(query.startTime, 'start');
  const end = normalizeDateBoundary(query.endTime, 'end');
  if (start) qb.andWhere('log.created_at >= :start', { start });
  if (end) qb.andWhere('log.created_at <= :end', { end });

  const [rows, total] = await qb.getManyAndCount();
  return {
    list: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      userType: row.user_type,
      success: row.success,
      message: row.message,
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function batchDeleteLoginLogs(ids: number[]): Promise<number> {
  const result = await loginLogRepo().delete({ id: In(ids) });
  return result.affected ?? 0;
}

export async function listLoginLogsForExport(query: LoginLogQuery) {
  const qb = loginLogRepo()
    .createQueryBuilder('log')
    .orderBy('log.createdAt', 'DESC')
    .take(5000);

  if (query.username?.trim()) {
    qb.andWhere('log.username LIKE :username', { username: `%${query.username.trim()}%` });
  }
  if (query.userType === 'ADMIN' || query.userType === 'APP') {
    qb.andWhere('log.user_type = :userType', { userType: query.userType });
  }
  if (query.success === 'true' || query.success === 'false') {
    qb.andWhere('log.success = :success', { success: query.success === 'true' });
  }
  const start = normalizeDateBoundary(query.startTime, 'start');
  const end = normalizeDateBoundary(query.endTime, 'end');
  if (start) qb.andWhere('log.created_at >= :start', { start });
  if (end) qb.andWhere('log.created_at <= :end', { end });

  const rows = await qb.getMany();
  return rows.map((row) => ({
    username: row.username ?? '',
    userType: row.user_type,
    success: row.success ? '成功' : '失败',
    message: row.message ?? '',
    ip: row.ip ?? '',
    userAgent: row.user_agent ?? '',
    createdAt: row.createdAt,
  }));
}
