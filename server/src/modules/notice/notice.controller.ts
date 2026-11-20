import type { Request } from 'express';
import { ok } from '../../utils/response';
import type { CreateNoticeInput, NoticeQuery, UpdateNoticeInput } from './notice.dto';
import {
  createNotice,
  deleteNotice,
  getNotice,
  listNotices,
  updateNotice,
  updateNoticeStatus,
} from './notice.service';
import type { NoticeStatus } from '../../db/entities';

export async function listNoticesController(req: Request) {
  return ok(await listNotices(req.query as unknown as NoticeQuery));
}

export async function getNoticeController(req: Request) {
  return ok(await getNotice(Number(req.params.id)));
}

export async function createNoticeController(req: Request) {
  return ok(await createNotice(req.body as CreateNoticeInput, req.auth!));
}

export async function updateNoticeController(req: Request) {
  return ok(await updateNotice(Number(req.params.id), req.body as UpdateNoticeInput, req.auth!));
}

export async function updateNoticeStatusController(req: Request) {
  const { status } = req.body as { status: NoticeStatus };
  return ok(await updateNoticeStatus(Number(req.params.id), status, req.auth!));
}

export async function deleteNoticeController(req: Request) {
  await deleteNotice(Number(req.params.id));
  return ok(null, '删除成功');
}
