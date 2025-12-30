import { JobStatus } from 'bull';
import { StatusCascadeBatchJob } from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';

export interface BaseQueueJob {
  batchId: string;
  userId: string;
  triggeredAt: Date;
  retryCount: number;
  failureReason?: string;
}

export interface JobStatusInfo<T = any> {
  id: string;
  state: JobStatus;
  progress: number;
  data: T;
  result: unknown;
  attemptsMade?: number;
  failedReason?: string;
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

import { Status } from 'src/shared/common/status';

export interface SingleCascadeResult {
  entityType: string;
  entityId: string;
  totalUpdated: number;
  cascadedLevels?: Array<{
    level: number;
    entityName: string;
    updatedCount: number;
  }>;
  affectedIds?: string[];
  error?: string;
}

export interface BatchCascadeResult {
  batchId: string;
  totalUpdated: number;
  results: SingleCascadeResult[];
  processedCount: number;
  failedCount: number;
}

export interface LevelCascadeResult {
  entityId: string;
  entityType: string;
  level: number;
  directChildrenUpdated: number; // Only direct children
  affectedChildIds: string[];
  targetStatus: Status | null;
  nextLevelJobsCreated: number;
}

export interface BatchProgress {
  batchId: string;
  batchJob: JobStatusInfo<StatusCascadeBatchJob> | null;
  levelJobs: LevelJobStats;
}

export interface LevelJobStats {
  byLevel: Array<{
    level: number;
    total: number;
    completed: number;
    failed: number;
  }>;
  total: number;
  completed: number;
  failed: number;
  active: number;
}

export interface CleanJobsResult {
  batchQueue: number;
  levelQueue: number;
  dlq: number;
  total: number;
}
