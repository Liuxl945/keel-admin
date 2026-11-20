import { AppDataSource } from '../../db/data-source';
import { UploadedFile } from '../../db/entities';
import { AppError, ERROR_CODES } from '../../utils/app-error';
import { parsePagination } from '../../utils/pagination';
import { storageProvider } from '../upload/storage/local-storage.provider';

function fileRepo() {
  return AppDataSource.getRepository(UploadedFile);
}

export interface CreateFileRecordInput {
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mimeType: string;
  uploaderId: number | null;
  uploaderName: string | null;
}

export async function createFileRecord(input: CreateFileRecordInput) {
  const row = fileRepo().create({
    filename: input.filename,
    original_name: input.originalName,
    url: input.url,
    size: input.size,
    mime_type: input.mimeType,
    uploader_id: input.uploaderId,
    uploader_name: input.uploaderName,
  });
  await fileRepo().save(row);
  return row;
}

export interface FileQuery {
  page?: unknown;
  pageSize?: unknown;
  keyword?: string;
  mimeType?: string;
}

function toDto(row: UploadedFile) {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    url: row.url,
    size: row.size,
    mimeType: row.mime_type,
    uploaderId: row.uploader_id,
    uploaderName: row.uploader_name,
    createdAt: row.createdAt,
  };
}

export async function listFiles(query: FileQuery) {
  const { page, pageSize } = parsePagination(query as Record<string, unknown>);
  const qb = fileRepo()
    .createQueryBuilder('file')
    .orderBy('file.createdAt', 'DESC')
    .skip((page - 1) * pageSize)
    .take(pageSize);

  if (query.keyword?.trim()) {
    qb.andWhere('(file.original_name LIKE :keyword OR file.filename LIKE :keyword OR file.uploader_name LIKE :keyword)', {
      keyword: `%${query.keyword.trim()}%`,
    });
  }
  if (query.mimeType?.trim() === 'image') {
    qb.andWhere('file.mime_type LIKE :mimeType', { mimeType: 'image/%' });
  }

  const [rows, total] = await qb.getManyAndCount();
  return { list: rows.map(toDto), total, page, pageSize };
}

export async function deleteFile(id: number) {
  const row = await fileRepo().findOneBy({ id });
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '文件不存在');

  await storageProvider.remove(row.filename);
  await fileRepo().delete({ id });
}
