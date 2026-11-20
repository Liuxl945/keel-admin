import type { Request } from 'express';
import { ok } from '../../utils/response';
import type { SyncedTableQuery } from './dev-db-table.dto';
import { getSyncedTable, listSyncedTables, syncTablesByConnection } from './dev-db-table.service';

export async function listSyncedTablesController(req: Request) {
  return ok(await listSyncedTables(req.query as unknown as SyncedTableQuery));
}

export async function getSyncedTableController(req: Request) {
  return ok(await getSyncedTable(Number(req.params.id)));
}

export async function syncTablesController(req: Request) {
  const count = await syncTablesByConnection(Number(req.params.connectionId));
  return ok({ count }, `已同步 ${count} 张表`);
}
