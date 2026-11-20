const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRange {
  start?: string;
  end?: string;
}

/**
 * 前端日期选择器只传 YYYY-MM-DD；这里补齐当天起止时刻并按 ISO 返回，
 * 避免字符串直接比较时漏掉结束日。
 */
export function normalizeDateBoundary(value: string | undefined, edge: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;

  if (DATE_ONLY.test(value)) {
    const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
    const date = new Date(`${value}T${time}`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function resolveDateRange(query: Record<string, unknown>, startKey: string, endKey: string): DateRange {
  const start = typeof query[startKey] === 'string' ? (query[startKey] as string) : undefined;
  const end = typeof query[endKey] === 'string' ? (query[endKey] as string) : undefined;
  return {
    start: normalizeDateBoundary(start, 'start')?.toISOString(),
    end: normalizeDateBoundary(end, 'end')?.toISOString(),
  };
}
