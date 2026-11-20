import { AppDataSource } from '../../db/data-source';
import { SysNotice, type NoticeStatus } from '../../db/entities';
import type { AuthContext } from '../../types/express';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import type { CreateNoticeInput, NoticeQuery, UpdateNoticeInput } from './notice.dto';

function noticeRepo() {
  return AppDataSource.getRepository(SysNotice);
}

function toDto(row: SysNotice) {
  return {
    id: row.id,
    title: row.title,
    noticeType: row.notice_type,
    content: row.content,
    status: row.status,
    publisherId: row.publisher_id,
    publisherName: row.publisher_name,
    publishedAt: row.published_at,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findOrFail(id: number): Promise<SysNotice> {
  const row = await noticeRepo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '公告不存在');
  return row;
}

export async function listNotices(query: NoticeQuery) {
  const { page, pageSize, title, noticeType, status } = query;
  const qb = noticeRepo()
    .createQueryBuilder('notice')
    .orderBy('notice.createdAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (title) qb.andWhere('notice.title LIKE :title', { title: `%${title}%` });
  if (noticeType) qb.andWhere('notice.notice_type = :noticeType', { noticeType });
  if (status) qb.andWhere('notice.status = :status', { status });

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toDto), total, page, pageSize };
}

export async function getNotice(id: number) {
  return toDto(await findOrFail(id));
}

export async function createNotice(input: CreateNoticeInput, operator: AuthContext) {
  const published = input.status === 'PUBLISHED';
  const row = noticeRepo().create({
    title: input.title,
    notice_type: input.noticeType,
    content: input.content,
    status: input.status,
    publisher_id: published ? operator.userId : null,
    publisher_name: published ? operator.username : null,
    published_at: published ? new Date() : null,
  });
  await noticeRepo().save(row);
  return toDto(row);
}

export async function updateNotice(id: number, input: UpdateNoticeInput, operator: AuthContext) {
  const row = await findOrFail(id);

  const patch: Partial<SysNotice> = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.noticeType !== undefined ? { notice_type: input.noticeType } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };

  if (input.status === 'PUBLISHED' && row.status !== 'PUBLISHED') {
    patch.published_at = new Date();
    patch.publisher_id = operator.userId;
    patch.publisher_name = operator.username;
  }

  if (Object.keys(patch).length > 0) await noticeRepo().update(id, patch);
  return toDto(await findOrFail(id));
}

export async function updateNoticeStatus(id: number, status: NoticeStatus, operator: AuthContext) {
  return updateNotice(id, { status }, operator);
}

export async function deleteNotice(id: number) {
  await findOrFail(id);
  await noticeRepo().delete({ id });
}
