import { Status } from 'src/shared/common/status';

export interface StatusCascadeBatchJob {
  batchId: string;
  updates: Array<{
    entityType: string;
    entityId: string;
    newStatus: Status;
  }>;
  userId: string;
  triggeredAt: Date;
  retryCount?: number;
  failureReason?: string;
}

export interface SingleCascadeResult {
  entityId: string;
  entityType: string;
  totalUpdated: number;
  affectedIds?: string[];
  cascadedLevels?: any[];
  error?: string;
}

export interface BatchCascadeResult {
  batchId: string;
  totalUpdated: number;
  results: SingleCascadeResult[];
  processedCount: number;
  failedCount: number;
}

// Interface cho job status response
export interface CascadeJobStatus {
  id: string;
  status: string;
  progress: number;
  data: StatusCascadeBatchJob;
  result?: BatchCascadeResult;
  retryCount: number;
  failureReason?: string;
}

export interface EntityHierarchyConfig {
  entityName: string;
  entityTarget: string;
  parentRelation?: string; // Tên relation đến parent
  childrenRelation?: string; // Tên relation đến children
  childEntityName?: string; // Tên entity con
  order: number; // Thứ tự trong hierarchy
}
