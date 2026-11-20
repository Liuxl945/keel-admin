import type { Request } from 'express';
import { ok } from '../../utils/response';
import type {
  CreateDataSourceInput,
  DataSourceQuery,
  UpdateDataSourceInput,
} from './dev-data-source.dto';
import {
  createDataSource,
  deleteDataSource,
  getDataSource,
  getDataSourceTables,
  listDataSourceOptions,
  listDataSources,
  syncDataSourceTablesById,
  testDataSourceConnection,
  updateDataSource,
} from './dev-data-source.service';

export async function listDataSourcesController(req: Request) {
  return ok(await listDataSources(req.query as unknown as DataSourceQuery));
}

export async function listDataSourceOptionsController() {
  return ok(await listDataSourceOptions());
}

export async function getDataSourceController(req: Request) {
  return ok(await getDataSource(Number(req.params.id)));
}

export async function createDataSourceController(req: Request) {
  return ok(await createDataSource(req.body as CreateDataSourceInput, req.auth!), '连接已创建');
}

export async function updateDataSourceController(req: Request) {
  return ok(
    await updateDataSource(Number(req.params.id), req.body as UpdateDataSourceInput, req.auth!),
    '连接已保存',
  );
}

export async function deleteDataSourceController(req: Request) {
  await deleteDataSource(Number(req.params.id));
  return ok(null, '删除成功');
}

export async function testDataSourceController(req: Request) {
  const result = await testDataSourceConnection(Number(req.params.id));
  return ok(result, result.ok ? '连接成功' : '连接失败');
}

export async function getDataSourceTablesController(req: Request) {
  return ok(await getDataSourceTables(Number(req.params.id)));
}

export async function syncDataSourceTablesController(req: Request) {
  const count = await syncDataSourceTablesById(Number(req.params.id));
  return ok({ count }, `已同步 ${count} 张表`);
}
