function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 导出文件用本地时间，避免 Excel 里出现 UTC ISO 字符串 */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
