/**
 * 上传控件的值编解码。
 * 单文件存 URL 字符串（兼容旧数据），多文件存 JSON 数组字符串；
 * 读取时两种格式都能解析，列表展示统一还原成文件名。
 */

export function decodeUploadUrls(raw: string | null | undefined): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // 非法 JSON 按普通 URL 兜底
    }
  }
  return [text];
}

/** 0 个存空串、1 个存 URL 本身、多个存 JSON 数组（保持旧数据的单值格式） */
export function encodeUploadUrls(urls: string[]): string {
  const list = urls.map((url) => String(url ?? '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return JSON.stringify(list);
}

/** 取 URL 里的文件名，用于上传列表展示 */
export function fileNameOf(url: string): string {
  const text = String(url ?? '').trim();
  if (!text) return '';
  const path = text.split('?')[0].split('#')[0];
  const name = path.split('/').pop() || path;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** 列表单元格展示：多个文件用「、」拼接，空值显示 - */
export function formatUploadCell(value: unknown): string {
  const raw = typeof value === 'string' ? value : value == null ? '' : String(value);
  const urls = decodeUploadUrls(raw);
  if (urls.length === 0) return '-';
  return urls.map((url) => fileNameOf(url) || url).join('、');
}
