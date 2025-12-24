export type Action =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'restored'
  | 'fetched'
  | 'start'
  | 'failed'
  | 'validated'
  | 'processing'
  | 'completed'
  | 'skipped'
  | 'cancelled'
  | 'archived'
  | 'activated'
  | 'deactivated'
  | 'imported'
  | 'exported'
  | 'synced'
  | 'sent'
  | 'received'
  | 'queued'
  | 'retrying'
  | 'warning'
  | 'success';

export type ActionStatus = 'success' | 'error' | 'warning' | 'info' | 'pending';

export interface MessageOptions {
  action: Action;
  entity: string;
  id?: number | string;
  reason?: string;
  count?: number;
  duration?: number;
  metadata?: Record<string, any>;
  status?: ActionStatus;
  customTemplate?: string;
}

export interface MessageTemplate {
  success: string;
  progress: string;
  error: string;
}
