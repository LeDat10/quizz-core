export interface ErrorContext {
  method: string;
  entity?: string;
  id?: number | string;
  operation?: string;
  traceId?: string;
  userId?: string;
  [key: string]: any;
}
