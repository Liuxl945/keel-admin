import type { Request, Response } from 'express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { formatDateTime } from '../../utils/datetime';
import { buildExcelBuffer, sendExcel, type ExcelColumn } from '../../utils/excel';
import { ok } from '../../utils/response';
import type { LoginLogQuery, OperationLogQuery } from './log.dto';
import {
  batchDeleteLoginLogs,
  batchDeleteOperationLogs,
  getOperationLog,
  listLoginLogs,
  listLoginLogsForExport,
  listOperationLogs,
  listOperationLogsForExport,
} from './log.service';

export async function listOperationLogsController(req: Request) {
  return ok(await listOperationLogs(req.query as unknown as OperationLogQuery));
}

export async function getOperationLogController(req: Request) {
  const log = await getOperationLog(Number(req.params.id));
  if (!log) throw new AppError(ERROR_CODES.NOT_FOUND, '日志不存在');
  return ok(log);
}

export async function batchDeleteOperationLogsController(req: Request) {
  const { ids } = req.body as { ids: number[] };
  const count = await batchDeleteOperationLogs(ids);
  return ok({ count }, `已清理 ${count} 条日志`);
}

export async function listLoginLogsController(req: Request) {
  return ok(await listLoginLogs(req.query as unknown as LoginLogQuery));
}

export async function batchDeleteLoginLogsController(req: Request) {
  const { ids } = req.body as { ids: number[] };
  const count = await batchDeleteLoginLogs(ids);
  return ok({ count }, `已清理 ${count} 条日志`);
}

const OPERATION_EXPORT_COLUMNS: ExcelColumn[] = [
  { header: '操作人', key: 'username', width: 18 },
  { header: '方法', key: 'method', width: 10 },
  { header: '路径', key: 'path', width: 40 },
  { header: 'HTTP 状态', key: 'statusCode', width: 12 },
  { header: '业务码', key: 'bizCode', width: 10 },
  { header: '耗时(ms)', key: 'durationMs', width: 12 },
  { header: 'IP', key: 'ip', width: 18 },
  { header: '操作时间', key: 'createdAt', width: 22 },
];

const LOGIN_EXPORT_COLUMNS: ExcelColumn[] = [
  { header: '账号', key: 'username', width: 18 },
  { header: '端', key: 'userType', width: 10 },
  { header: '结果', key: 'success', width: 10 },
  { header: '说明', key: 'message', width: 28 },
  { header: 'IP', key: 'ip', width: 18 },
  { header: 'UA', key: 'userAgent', width: 40 },
  { header: '登录时间', key: 'createdAt', width: 22 },
];

export async function exportOperationLogsController(req: Request, res: Response) {
  const rows = await listOperationLogsForExport(req.query as unknown as OperationLogQuery);
  const buffer = await buildExcelBuffer(
    '操作日志',
    OPERATION_EXPORT_COLUMNS,
    rows.map((row) => ({ ...row, createdAt: formatDateTime(row.createdAt) })),
  );
  sendExcel(res, buffer, `操作日志_${Date.now()}.xlsx`);
}

export async function exportLoginLogsController(req: Request, res: Response) {
  const rows = await listLoginLogsForExport(req.query as unknown as LoginLogQuery);
  const buffer = await buildExcelBuffer(
    '登录日志',
    LOGIN_EXPORT_COLUMNS,
    rows.map((row) => ({ ...row, createdAt: formatDateTime(row.createdAt) })),
  );
  sendExcel(res, buffer, `登录日志_${Date.now()}.xlsx`);
}
