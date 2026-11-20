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

export interface PageQuery {
  page?: number;
  pageSize?: number;
  [key: string]: unknown;
}
