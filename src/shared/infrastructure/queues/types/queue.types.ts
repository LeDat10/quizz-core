import {
  StatusCascadeBatchJob,
  StatusCascadeLevelJob,
} from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';

export type entityType = 'category' | 'course' | 'chapter' | 'lesson';
export type StatusCascadeDLQJob = StatusCascadeBatchJob | StatusCascadeLevelJob;
