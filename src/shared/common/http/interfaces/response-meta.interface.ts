export interface ResponseMeta {
  timestamp: string;
  path?: string;
  method?: string;
  requestId?: string;
  version?: string;
  duration?: number;
}
