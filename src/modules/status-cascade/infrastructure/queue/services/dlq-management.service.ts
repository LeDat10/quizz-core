import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { StatusCascadeBatchJob } from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';
import { LoggerHelper } from 'src/shared/common/logging';
import { QUEUE_CONSTANTS } from 'src/shared/infrastructure/queues/constants/queue.constant';

@Injectable()
export class DLQManagementService {
  private readonly logger = new LoggerHelper(DLQManagementService.name);

  constructor(
    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_DLQ)
    private readonly dlq: Queue<StatusCascadeBatchJob>,

    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE)
    private batchQueue: Queue<StatusCascadeBatchJob>,
  ) {}

  /**
   * Get all jobs in DLQ with filtering
   */
  async getDLQJobs(options?: {
    limit?: number;
    offset?: number;
    sortBy?: 'timestamp' | 'retryCount';
    order?: 'asc' | 'desc';
  }) {
    const jobs = await this.dlq.getJobs(['completed', 'failed', 'waiting']);

    // Sort jobs
    const sorted = jobs.sort((a, b) => {
      if (options?.sortBy === 'retryCount') {
        return options?.order === 'desc'
          ? b.data.retryCount - a.data.retryCount
          : a.data.retryCount - b.data.retryCount;
      }
      // Default: sort by timestamp
      return options?.order === 'desc'
        ? b.timestamp - a.timestamp
        : a.timestamp - b.timestamp;
    });

    // Paginate
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    const paginated = sorted.slice(offset, offset + limit);

    return {
      jobs: paginated.map((job) => ({
        id: job.id?.toString() ?? 'unknown',
        batchId: job.data.batchId,
        failureReason: job.data.failureReason,
        retryCount: job.data.retryCount,
        triggeredAt: job.data.triggeredAt,
        failedAt: new Date(job.timestamp),
        updates: job.data.updates,
      })),
      total: sorted.length,
      offset,
      limit,
    };
  }

  /**
   * Retry job from DLQ
   */
  async retryFromDLQ(dlqJobId: string): Promise<string> {
    const dlqJob = await this.dlq.getJob(dlqJobId);

    if (!dlqJob) {
      throw new Error(`DLQ job ${dlqJobId} not found`);
    }

    const jobData = { ...dlqJob.data };
    jobData.retryCount = 0;
    delete jobData.failureReason;

    const newBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    jobData.batchId = newBatchId;

    await this.batchQueue.add('cascade-batch', jobData, {
      jobId: newBatchId,
      attempts: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.BACKOFF_DELAY,
      },
    });

    await dlqJob.remove();

    this.logger.info(
      { method: 'retryFromDLQ', entity: '' },
      'retrying',
      undefined,
      {
        oldJobId: dlqJobId,
        newBatchId,
      },
    );

    return newBatchId;
  }

  /**
   * Bulk retry multiple DLQ jobs
   */
  async bulkRetryFromDLQ(dlqJobIds: string[]): Promise<{
    succeeded: string[];
    failed: Array<{ jobId: string; error: string }>;
  }> {
    const succeeded: string[] = [];
    const failed: Array<{ jobId: string; error: string }> = [];

    for (const jobId of dlqJobIds) {
      try {
        const newBatchId = await this.retryFromDLQ(jobId);
        succeeded.push(newBatchId);
      } catch (error) {
        failed.push({
          jobId,
          error: (error as Error).message,
        });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Delete old DLQ jobs (cleanup)
   */
  async cleanupDLQ(olderThanDays: number = 30): Promise<number> {
    const timestamp = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const jobs = await this.dlq.getJobs(['completed', 'failed', 'waiting']);

    const oldJobs = jobs.filter((job) => job.timestamp < timestamp);
    await Promise.all(oldJobs.map((job) => job.remove()));

    this.logger.info(
      { method: 'cleanupDLQ', entity: '' },
      'cancelled',
      undefined,
      {
        removedCount: oldJobs.length,
        olderThanDays,
      },
    );

    return oldJobs.length;
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats() {
    const jobs = await this.dlq.getJobs(['completed', 'failed', 'waiting']);

    const stats = {
      total: jobs.length,
      byRetryCount: new Map<number, number>(),
      oldestJob:
        jobs.length > 0 ? Math.min(...jobs.map((j) => j.timestamp)) : null,
      newestJob:
        jobs.length > 0 ? Math.max(...jobs.map((j) => j.timestamp)) : null,
    };

    for (const job of jobs) {
      const retryCount = job.data.retryCount;
      stats.byRetryCount.set(
        retryCount,
        (stats.byRetryCount.get(retryCount) ?? 0) + 1,
      );
    }

    return {
      ...stats,
      byRetryCount: Array.from(stats.byRetryCount.entries()).map(
        ([retries, count]) => ({ retries, count }),
      ),
    };
  }
}
