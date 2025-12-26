export interface ErrorDetail {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}
