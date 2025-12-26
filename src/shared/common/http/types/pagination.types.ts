export interface PaginationOptions {
  page: number;
  limit: number;
  total: number;
  path: string;
  query?: Record<string, any>;
}

export interface PaginationConfig {
  defaultPage?: number;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface NormalizedPaginationParams {
  page: number;
  limit: number;
  offset: number;
}
