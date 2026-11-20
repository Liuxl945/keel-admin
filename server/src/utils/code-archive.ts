import type { Response } from 'express';
import { createZip, type ZipEntry } from './zip';

export interface ArchiveSourceFile {
  /** 相对项目根目录的路径，例如 server/src/biz/demo/demo.entity.ts */
  name: string;
  content: string;
}

export interface CodeArchive {
  fileName: string;
  buffer: Buffer;
  entryCount: number;
}

/** 文件名只保留安全字符，避免中文/空格在 Content-Disposition 里出问题 */
function safeBaseName(value: string): string {
  return (
    value
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'generated'
  );
}

function sortKey(name: string): string {
  // README 排在所在目录最后，其余按路径字典序
  return name.replace(/\/(README\.md)$/i, '/zzz-$1');
}

/**
 * 把生成的文件打成 zip：包内路径就是「相对项目根目录」的路径，
 * 解压到项目根目录即自动落到 server/src/biz/* 与 admin/src/views/biz/*，无需手工搬文件。
 */
export function buildCodeArchive(files: ArchiveSourceFile[], baseName: string): CodeArchive {
  const entries: ZipEntry[] = [...files]
    .filter((file) => Boolean(file.name))
    .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)))
    .map((file) => ({ path: file.name, content: file.content }));

  return {
    fileName: `${safeBaseName(baseName)}-code.zip`,
    buffer: createZip(entries),
    entryCount: entries.length,
  };
}

export function sendCodeArchive(res: Response, archive: CodeArchive): void {
  const encoded = encodeURIComponent(archive.fileName);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${archive.fileName}"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Length', String(archive.buffer.length));
  res.send(archive.buffer);
}
