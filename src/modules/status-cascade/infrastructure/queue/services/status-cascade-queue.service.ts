import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { QUEUE_CONSTANTS } from '../../../../../shared/infrastructure/queues/constants/queue.constant';
import { Job, JobStatus, Queue } from 'bull';
import { Status } from 'src/shared/common/status';
import {
  getEntityConfig,
  getMaxCascadeLevels,
} from 'src/modules/status-cascade/domain/helpers/entity-config.helper';
import {
  StatusCascadeBatchJob,
  StatusCascadeLevelJob,
} from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';
import {
  BatchProgress,
  JobStatusInfo,
} from '../../../../../shared/infrastructure/queues/interfaces/queue-job.interface';
import { entityType } from 'src/shared/infrastructure/queues/types/queue.types';

@Injectable()
export class StatusCascadeQueueService {
  constructor(
    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE)
    private batchQueue: Queue<StatusCascadeBatchJob>,

    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL)
    private levelQueue: Queue<StatusCascadeLevelJob>,

    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_DLQ)
    private dlq: Queue<StatusCascadeBatchJob>,
  ) {}

  async startLevelBasedCascade(
    entityType: entityType,
    entityId: string,
    newStatus: Status,
    userId: string,
  ): Promise<string> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.levelQueue.add(
      'cascade-level',
      {
        batchId,
        parentJobId: batchId,
        level: 0,
        entityType,
        entityId,
        newStatus,
        userId,
        triggeredAt: new Date(),
        retryCount: 0,
        metadata: {
          totalLevels: getMaxCascadeLevels(entityType),
          currentPath: `${entityType}-${entityId}`,
        },
      },
      {
        jobId: `${batchId}-L0-${entityType}-${entityId}`,
        priority: 0,
        attempts: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.BACKOFF_DELAY,
        },
        removeOnComplete: {
          age: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.RETENTION.COMPLETED_AGE,
          count: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.RETENTION.COMPLETED_COUNT,
        },
        removeOnFail: false,
      },
    );

    return batchId;
  }

  async addBatchCascadeJob(
    updates: Array<{
      entityType: string;
      entityId: string;
      newStatus: Status;
    }>,
    userId: string,
  ): Promise<string> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const sortedUpdates = updates.sort((a, b) => {
      const configA = getEntityConfig(a.entityType);
      const configB = getEntityConfig(b.entityType);
      return (configA?.order ?? 999) - (configB?.order ?? 999);
    });

    await this.batchQueue.add(
      'cascade-batch',
      {
        batchId,
        updates: sortedUpdates,
        userId,
        triggeredAt: new Date(),
        retryCount: 0,
      },
      {
        jobId: batchId,
        attempts: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.BACKOFF_DELAY,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return batchId;
  }

  /**
   * NEW: Get detailed batch progress (including level jobs)
   */
  async getBatchProgress(batchId: string): Promise<BatchProgress> {
    const [batchJob, levelJobs] = await Promise.all([
      this.batchQueue.getJob(batchId),
      this.getLevelJobs(batchId),
    ]);

    const levelStats = {
      byLevel: new Map<
        number,
        { total: number; completed: number; failed: number }
      >(),
      total: levelJobs.length,
      completed: 0,
      failed: 0,
      active: 0,
    };

    for (const job of levelJobs) {
      const state = await job.getState();
      const level = job.data.level;

      if (!levelStats.byLevel.has(level)) {
        levelStats.byLevel.set(level, { total: 0, completed: 0, failed: 0 });
      }

      const levelStat = levelStats.byLevel.get(level)!;
      levelStat.total++;

      if (state === 'completed') {
        levelStats.completed++;
        levelStat.completed++;
      } else if (state === 'failed') {
        levelStats.failed++;
        levelStat.failed++;
      } else if (state === 'active') {
        levelStats.active++;
      }
    }

    return {
      batchId,
      batchJob: batchJob ? await this.getJobStatus(batchJob) : null,
      levelJobs: {
        ...levelStats,
        byLevel: Array.from(levelStats.byLevel.entries()).map(
          ([level, stats]) => ({
            level,
            ...stats,
          }),
        ),
      },
    };
  }

  private async getLevelJobs(batchId: string) {
    const allJobs = await this.levelQueue.getJobs([
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    ]);
    return allJobs.filter((job) => job.data.batchId === batchId);
  }

  /**
   * Type-safe job status getter
   */
  private async getJobStatus<T = any>(job: Job<T>): Promise<JobStatusInfo<T>> {
    const state = await job.getState();
    return {
      id: job.id?.toString() ?? 'unknown',
      state: state as JobStatus,
      progress: (typeof job.progress === 'function'
        ? job.progress()
        : 0) as number,
      data: job.data,
      result: job.returnvalue as unknown,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
    };
  }

  async moveToDeadLetterQueue(
    job: StatusCascadeBatchJob,
    failureReason: string,
  ): Promise<void> {
    await this.dlq.add(
      'failed-cascade',
      { ...job, failureReason },
      {
        removeOnComplete: false,
      },
    );
  }

  async cancelBatchCascade(batchId: string) {
    const levelJobs = await this.getLevelJobs(batchId);

    let cancelled = 0;
    let alreadyCompleted = 0;
    let alreadyActive = 0;

    for (const job of levelJobs) {
      const state = await job.getState();

      if (state === 'completed') {
        alreadyCompleted++;
      } else if (state === 'active') {
        alreadyActive++;
      } else if (state === 'waiting' || state === 'delayed') {
        await job.remove();
        cancelled++;
      }
    }

    return { cancelled, alreadyCompleted, alreadyActive };
  }

  async getQueueMetrics() {
    const [batchMetrics, levelMetrics] = await Promise.all([
      this.getQueueCounts(this.batchQueue),
      this.getQueueCounts(this.levelQueue),
    ]);

    const dlqCount = await this.dlq.getJobCounts();

    return {
      batchQueue: batchMetrics,
      levelQueue: levelMetrics,
      deadLetterQueue: {
        total: dlqCount.waiting + dlqCount.completed + dlqCount.failed,
      },
    };
  }

  private async getQueueCounts(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }

  // Admin methods for cleanup, retry, etc.
  async cleanupCompletedJobs(olderThanHours: number = 24) {
    const timestamp = Date.now() - olderThanHours * 60 * 60 * 1000;

    const [batchCompleted, levelCompleted] = await Promise.all([
      this.batchQueue.getJobs(['completed']),
      this.levelQueue.getJobs(['completed']),
    ]);

    const oldBatchJobs = batchCompleted.filter(
      (job) => job.timestamp < timestamp,
    );
    const oldLevelJobs = levelCompleted.filter(
      (job) => job.timestamp < timestamp,
    );

    await Promise.all([
      ...oldBatchJobs.map((job) => job.remove()),
      ...oldLevelJobs.map((job) => job.remove()),
    ]);

    return {
      batchQueue: oldBatchJobs.length,
      levelQueue: oldLevelJobs.length,
      total: oldBatchJobs.length + oldLevelJobs.length,
    };
  }

  /**
   * Get job retention statistics
   * Useful for monitoring memory usage
   */
  async getJobRetentionStats(): Promise<{
    batchQueue: {
      completed: { total: number; oldestTimestamp?: number };
      failed: { total: number; oldestTimestamp?: number };
    };
    levelQueue: {
      completed: { total: number; oldestTimestamp?: number };
      failed: { total: number; oldestTimestamp?: number };
    };
    dlq: {
      total: number;
      oldestTimestamp?: number;
    };
  }> {
    const [batchCompleted, batchFailed, levelCompleted, levelFailed, dlqJobs] =
      await Promise.all([
        this.batchQueue.getJobs(['completed']),
        this.batchQueue.getJobs(['failed']),
        this.levelQueue.getJobs(['completed']),
        this.levelQueue.getJobs(['failed']),
        this.dlq.getJobs(['failed', 'waiting', 'completed']),
      ]);

    const getOldestTimestamp = (jobs: Job[]) => {
      if (jobs.length === 0) return undefined;
      return Math.min(...jobs.map((job) => job.timestamp));
    };

    return {
      batchQueue: {
        completed: {
          total: batchCompleted.length,
          oldestTimestamp: getOldestTimestamp(batchCompleted),
        },
        failed: {
          total: batchFailed.length,
          oldestTimestamp: getOldestTimestamp(batchFailed),
        },
      },
      levelQueue: {
        completed: {
          total: levelCompleted.length,
          oldestTimestamp: getOldestTimestamp(levelCompleted),
        },
        failed: {
          total: levelFailed.length,
          oldestTimestamp: getOldestTimestamp(levelFailed),
        },
      },
      dlq: {
        total: dlqJobs.length,
        oldestTimestamp: getOldestTimestamp(dlqJobs),
      },
    };
  }

  /**
   * Retry a specific failed job
   * Works for both batch and level queues
   */
  async retryFailedJob(
    queueType: 'batch' | 'level',
    jobId: string,
  ): Promise<{
    success: boolean;
    newJobId?: string;
    message: string;
  }> {
    const queue = queueType === 'batch' ? this.batchQueue : this.levelQueue;
    const job = await queue.getJob(jobId);

    if (!job) {
      return {
        success: false,
        message: `Job ${jobId} not found in ${queueType} queue`,
      };
    }

    const state = await job.getState();
    if (state !== 'failed') {
      return {
        success: false,
        message: `Job ${jobId} is not in failed state (current: ${state})`,
      };
    }

    try {
      // Retry the job (Bull will attempt it again)
      await job.retry();

      return {
        success: true,
        newJobId: jobId, // Same job, just retried
        message: `Job ${jobId} queued for retry`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to retry job: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Bulk retry multiple failed jobs
   */
  async bulkRetryFailedJobs(
    jobs: Array<{ queueType: 'batch' | 'level'; jobId: string }>,
  ): Promise<{
    succeeded: string[];
    failed: Array<{ jobId: string; error: string }>;
  }> {
    const succeeded: string[] = [];
    const failed: Array<{ jobId: string; error: string }> = [];

    for (const { queueType, jobId } of jobs) {
      try {
        const result = await this.retryFailedJob(queueType, jobId);
        if (result.success) {
          succeeded.push(jobId);
        } else {
          failed.push({ jobId, error: result.message });
        }
      } catch (error) {
        failed.push({ jobId, error: (error as Error).message });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Get all failed jobs from both queues
   */
  async getAllFailedJobs(options?: {
    queueType?: 'batch' | 'level' | 'all';
    limit?: number;
    offset?: number;
  }) {
    const queueType = options?.queueType ?? 'all';
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const fetchBatch = queueType === 'all' || queueType === 'batch';
    const fetchLevel = queueType === 'all' || queueType === 'level';

    const [batchFailed, levelFailed] = await Promise.all([
      fetchBatch ? this.batchQueue.getJobs(['failed']) : Promise.resolve([]),
      fetchLevel ? this.levelQueue.getJobs(['failed']) : Promise.resolve([]),
    ]);

    const allFailed = [
      ...batchFailed.map((job) => ({
        queueType: 'batch' as const,
        job,
      })),
      ...levelFailed.map((job) => ({
        queueType: 'level' as const,
        job,
      })),
    ];

    // Sort by timestamp (newest first)
    allFailed.sort((a, b) => b.job.timestamp - a.job.timestamp);

    // Paginate
    const paginated = allFailed.slice(offset, offset + limit);

    return {
      jobs: paginated.map(({ queueType, job }) => ({
        queueType,
        id: job.id?.toString() ?? 'unknown',
        batchId: job.data.batchId,
        entityType: 'entityType' in job.data ? job.data.entityType : undefined,
        entityId: 'entityId' in job.data ? job.data.entityId : undefined,
        level: 'level' in job.data ? job.data.level : undefined,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: new Date(job.timestamp),
        data: job.data,
      })),

      total: allFailed.length,
      offset,
      limit,
    };
  }

  // /**
  //  * Clean up failed jobs that are too old
  //  * Keep recent failures for debugging
  //  *
  //  * @param olderThanDays - Remove failed jobs older than X days (default: 7 days)
  //  * @returns Number of jobs cleaned
  //  */
  // async cleanupOldFailedJobs(
  //   olderThanDays: number = 7,
  // ): Promise<CleanJobsResult> {
  //   const timestamp = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  //   const [batchFailed, levelFailed, dlqJobs] = await Promise.all([
  //     this.batchQueue.getJobs(['failed']),
  //     this.levelQueue.getJobs(['failed']),
  //     this.dlq.getJobs(['failed', 'waiting', 'completed']),
  //   ]);

  //   // Filter old failed jobs
  //   const oldBatchFailed = batchFailed.filter(
  //     (job) => job.timestamp < timestamp,
  //   );
  //   const oldLevelFailed = levelFailed.filter(
  //     (job) => job.timestamp < timestamp,
  //   );
  //   const oldDlqJobs = dlqJobs.filter((job) => job.timestamp < timestamp);

  //   // Remove old failed jobs
  //   await Promise.all([
  //     ...oldBatchFailed.map((job) => job.remove()),
  //     ...oldLevelFailed.map((job) => job.remove()),
  //     ...oldDlqJobs.map((job) => job.remove()),
  //   ]);

  //   const batchCount = oldBatchFailed.length;
  //   const levelCount = oldLevelFailed.length;
  //   const dlqCount = oldDlqJobs.length;

  //   return {
  //     batchQueue: batchCount,
  //     levelQueue: levelCount,
  //     dlq: dlqCount,
  //     total: batchCount + levelCount + dlqCount,
  //   };
  // }

  /**
   * Clean up old failed jobs
   */
  async cleanupOldFailedJobs(olderThanDays: number = 7): Promise<{
    batchQueue: number;
    levelQueue: number;
    total: number;
  }> {
    const timestamp = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    const [batchFailed, levelFailed] = await Promise.all([
      this.batchQueue.getJobs(['failed']),
      this.levelQueue.getJobs(['failed']),
    ]);

    const oldBatchFailed = batchFailed.filter(
      (job) => job.timestamp < timestamp,
    );
    const oldLevelFailed = levelFailed.filter(
      (job) => job.timestamp < timestamp,
    );

    await Promise.all([
      ...oldBatchFailed.map((job) => job.remove()),
      ...oldLevelFailed.map((job) => job.remove()),
    ]);

    return {
      batchQueue: oldBatchFailed.length,
      levelQueue: oldLevelFailed.length,
      total: oldBatchFailed.length + oldLevelFailed.length,
    };
  }

  // /**
  //  * Retry job from DLQ (manual retry by admin)
  //  */
  // async retryFromDLQ(dlqJobId: string): Promise<string> {
  //   const dlqJob = await this.dlq.getJob(dlqJobId);

  //   if (!dlqJob) {
  //     throw new Error(`DLQ job ${dlqJobId} not found`);
  //   }

  //   const jobData = { ...dlqJob.data };
  //   jobData.retryCount = 0;
  //   delete jobData.failureReason;

  //   const newBatchId = await this.addBatchCascadeJob(
  //     jobData.updates,
  //     jobData.userId,
  //   );

  //   await dlqJob.remove();

  //   return newBatchId;
  // }

  // /**
  //  * Get all DLQ jobs (for admin dashboard)
  //  */
  // async getDLQJobs(): Promise<
  //   Array<{
  //     id: string;
  //     data: StatusCascadeBatchJob;
  //     failedAt: Date;
  //   }>
  // > {
  //   const jobs = await this.dlq.getJobs(['completed', 'failed', 'waiting']);

  //   return jobs.map((job) => ({
  //     id: job.id?.toString() ?? 'unknown',
  //     data: job.data,
  //     failedAt: new Date(job.timestamp),
  //   }));
  // }
}
