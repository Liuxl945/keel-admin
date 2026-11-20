import { ok } from '../../utils/response';
import { getServerInfo } from './monitor.service';

export async function serverInfoController() {
  return ok(await getServerInfo());
}
