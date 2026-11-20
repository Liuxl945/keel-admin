/**
 * 日期/时间控件的格式配置。
 *
 * 统一定义可选格式（dayjs / Element Plus token）与控件推导规则，供公共控件渲染与
 * 设计器属性面板共用。date 走 el-date-picker（年→日多档）；datetime 已改为「时间」
 * 控件（el-time-picker，仅 HH:mm:ss / HH:mm 两档，底层仍存完整时间戳，沿用 datetime 数据库列）。
 */

export interface DateFormatOption {
  /** 存库与显示的格式（dayjs token） */
  value: string;
  label: string;
}

/** 日期控件（el-date-picker）：从年到日的 4 档 */
export const DEV_DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  { value: 'YYYY', label: '年（YYYY）' },
  { value: 'YYYY-MM', label: '年月（YYYY-MM）' },
  { value: 'YYYY-MM-DD', label: '年月日（YYYY-MM-DD）' },
];

/** 时间控件（el-time-picker，内部 type 仍为 datetime）显示格式：仅两档 */
export const DEV_TIME_FORMAT_OPTIONS: DateFormatOption[] = [
  { value: 'HH:mm:ss', label: '时分秒（HH:mm:ss）' },
  { value: 'HH:mm', label: '时分（HH:mm）' },
];

/** 是否时间控件的格式 */
export function isTimeFormat(format?: string | null): boolean {
  return format === 'HH:mm:ss' || format === 'HH:mm';
}

/** datetime（时间控件）默认带秒，date 控件默认到日；旧字段无配置时按此兜底 */
export function defaultDateFormat(fieldType?: string | null): string {
  return fieldType === 'datetime' ? 'HH:mm:ss' : 'YYYY-MM-DD';
}

/**
 * 取字段实际使用的格式，空值回落到默认值。
 * datetime 已改为时间控件：若旧表单存着完整日期格式，运行时一律按 HH:mm:ss 处理，
 * 避免控件显示格式非法（旧数据无需重新保存也能正确渲染）。
 */
export function dateFormatOf(field: { type?: string | null; dateFormat?: string | null }): string {
  const fallback = defaultDateFormat(field.type);
  if (field.type === 'datetime' && !isTimeFormat(field.dateFormat)) return 'HH:mm:ss';
  return field.dateFormat || fallback;
}

/**
 * 按格式推导 el-date-picker 的 type（仅用于 date 控件）：
 * 含时/分/秒 token → datetime；到日 → date；到月 → month；只有年 → year。
 * 时间控件（HH:mm / HH:mm:ss）用 el-time-picker，不经过这里。
 */
export function datePickerTypeOf(format?: string | null): 'year' | 'month' | 'date' | 'datetime' {
  const value = format || '';
  if (/[Hms]/.test(value)) return 'datetime';
  if (/D{1,2}/.test(value)) return 'date';
  if (/M{1,2}/.test(value)) return 'month';
  return 'year';
}
