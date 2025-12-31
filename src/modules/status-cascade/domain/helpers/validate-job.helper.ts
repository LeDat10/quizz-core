import { StatusCascadeDLQJob } from 'src/shared/infrastructure/queues/types/queue.types';
import {
  StatusCascadeBatchJob,
  StatusCascadeLevelJob,
} from '../interfaces/cascade-job.interface';

export function isBatchJob(
  job: StatusCascadeDLQJob,
): job is StatusCascadeBatchJob {
  return 'updates' in job && Array.isArray(job.updates);
}

export function isLevelJob(
  job: StatusCascadeDLQJob,
): job is StatusCascadeLevelJob {
  return 'level' in job && 'entityType' in job && 'entityId' in job;
}
