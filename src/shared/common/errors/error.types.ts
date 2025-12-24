export interface ErrorMetadata {
  errorCode?: string;
  statusCode?: number;
  timestamp?: string;
  path?: string;
  [key: string]: any;
}

export interface ErrorResponse {
  message: string;
  errorCode: string;
  statusCode?: number;
  details?: any;
  timestamp?: string;
  path?: string;
}

export type ErrorType =
  | 'DuplicateEntry'
  | 'ForeignKeyViolation'
  | 'NullConstraintViolation'
  | 'CheckConstraintViolation'
  | 'QueryError'
  | 'EntityNotFound'
  | 'ConnectionError'
  | 'TimeoutError'
  | 'ValidationError'
  | 'HttpException'
  | 'UnknownError';
