type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 后端返回 UTC ISO 字符串，统一转本地时区展示。
 * 禁止在页面里 replace('T', ' ').slice(...)，那样会差 8 小时。
 */
export function formatDateTime(value: DateInput, withSeconds = false): string {
  const date = toDate(value);
  if (!date) return '-';
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base;
}

export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatClock(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '-';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 按控件的日期格式串（dayjs token）输出，决定展示粒度：
 * YYYY / YYYY-MM / YYYY-MM-DD / … HH:mm:ss。时区语义与 formatDateTime 一致：
 * 值里的 UTC ISO 会转成本地时间后再取各字段。pattern 为空时回落为纯文本，
 * 调用方应传默认格式以保证旧数据仍按日期格式化。
 */
export function formatByPattern(value: DateInput, pattern?: string | null): string {
  if (value === null || value === undefined || value === '') return '-';
  if (!pattern) return String(value);

  const isTimeOnly = !/YYYY|MM|DD/.test(pattern);
  let date: Date | null;

  if (isTimeOnly && typeof value === 'string') {
    // 纯时间值 `HH:mm` / `HH:mm:ss` 用锚定日期解析，取回本地时分秒
    const timeMatch = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      date = new Date(
        2000,
        0,
        1,
        Number(timeMatch[1]),
        Number(timeMatch[2]),
        Number(timeMatch[3] ?? 0),
      );
    } else {
      // datetime 列读出的完整时间字符串 / UTC ISO，仍走正常解析（UTC→本地）
      date = toDate(value);
    }
  } else {
    // `YYYY-MM-DD HH` 只到小时的值原生 Date 解析不了，补成完整时间再解析
    const normalized =
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}$/.test(value) ? `${value}:00:00` : value;
    date = toDate(normalized);
  }

  if (!date) return String(value);
  return pattern
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
}

/** el-date-picker(datetime) 回填需要本地 YYYY-MM-DDTHH:mm，不能直接截 ISO */
export function toLocalDateTimeInput(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
