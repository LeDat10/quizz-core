import { Status } from 'src/shared/common/status';
import { BaseQueueJob } from 'src/shared/infrastructure/queues/interfaces/queue-job.interface';

export interface StatusCascadeBatchJob extends BaseQueueJob {
  updates: Array<{
    entityType: string;
    entityId: string;
    newStatus: Status;
  }>;
}

export interface StatusCascadeLevelJob extends BaseQueueJob {
  parentJobId: string;
  level: number;
  entityType: string;
  entityId: string;
  newStatus: Status;
  parentStatus?: Status;
  metadata?: {
    totalLevels: number;
    currentPath: string;
  };
}

export interface CascadeResult {
  batchId: string;
  totalUpdated: number;
  affectedIds: string[];
  cascadedLevels?: Array<{
    level: number;
    entityName: string;
    updatedCount: number;
  }>;
}

export interface CancelBatchCascade {
  batchJob: { cancelled: boolean; reason: string };
  levelJobs: {
    cancelled: number;
    alreadyCompleted: number;
    alreadyActive: number;
  };
}
