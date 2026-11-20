export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T | null;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function ok<T>(data: T, message = 'ok'): ApiEnvelope<T> {
  return { code: 0, message, data };
}

export function pageData<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): ApiEnvelope<PageResult<T>> {
  return ok({ list, total, page, pageSize });
}
