import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import {
  STATUS_CASCADE_DLQ,
  STATUS_CASCADE_QUEUE,
} from './status-cascade.constant';
import {
  BatchCascadeResult,
  CascadeJobStatus,
  StatusCascadeBatchJob,
} from './status-cascade.interface';
import { Queue } from 'bull';
import { Status } from 'src/shared/common/status';
import { getEntityConfig } from './status-cascade.helper';

@Injectable()
export class StatusCascadeQueue {
  private readonly processingKeys = new Set<string>();

  constructor(
    @InjectQueue(STATUS_CASCADE_QUEUE)
    private queue: Queue<StatusCascadeBatchJob>,

    @InjectQueue(STATUS_CASCADE_DLQ)
    private dlq: Queue<StatusCascadeBatchJob>,
  ) {}

  async addBatchCascadeJob(
    updates: Array<{
      entityType: string;
      entityId: string;
      newStatus: Status;
    }>,
    userId: string,
  ): Promise<string> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Sort theo hierarchy order từ config
    const sortedUpdates = updates.sort((a, b) => {
      const configA = getEntityConfig(a.entityType);
      const configB = getEntityConfig(b.entityType);

      const orderA = configA?.order ?? 999;
      const orderB = configB?.order ?? 999;

      return orderA - orderB;
    });

    // Tạo data object với type rõ ràng
    const batchJobData: StatusCascadeBatchJob = {
      batchId,
      updates: sortedUpdates,
      userId,
      triggeredAt: new Date(),
      retryCount: 0,
    };

    await this.queue.add('cascade-batch', batchJobData, {
      jobId: batchId,
      attempts: 3, // Retry tối đa 3 lần
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s -> 4s -> 8s
      },
      removeOnComplete: true,
      removeOnFail: false, // Giữ failed jobs
    });

    return batchId;
  }

  /**
   * Move failed job to Dead Letter Queue
   */
  async moveToDeadLetterQueue(
    job: StatusCascadeBatchJob,
    failureReason: string,
  ): Promise<void> {
    const dlqJobData: StatusCascadeBatchJob = {
      ...job,
      failureReason,
    };

    await this.dlq.add('failed-cascade', dlqJobData, {
      removeOnComplete: false, // Giữ trong DLQ để admin review
    });
  }

  /**
   * Retry job từ DLQ (manual retry by admin)
   */
  async retryFromDLQ(dlqJobId: string): Promise<string> {
    const dlqJob = await this.dlq.getJob(dlqJobId);

    if (!dlqJob) {
      throw new Error(`DLQ job ${dlqJobId} not found`);
    }

    const jobData = dlqJob.data;

    // Reset retry count và add lại vào main queue
    jobData.retryCount = 0;
    delete jobData.failureReason;

    const newBatchId = await this.addBatchCascadeJob(
      jobData.updates,
      jobData.userId,
    );

    // Remove từ DLQ sau khi retry thành công
    await dlqJob.remove();

    return newBatchId;
  }

  /**
   * Get all DLQ jobs (for admin dashboard)
   */
  async getDLQJobs(): Promise<
    Array<{
      id: string;
      data: StatusCascadeBatchJob;
      failedAt: Date;
    }>
  > {
    const jobs = await this.dlq.getJobs(['completed', 'failed', 'waiting']);

    return jobs.map((job) => ({
      id: job.id.toString(),
      data: job.data,
      failedAt: new Date(job.timestamp),
    }));
  }

  /**
   * Get queue health metrics
   */
  async getQueueMetrics() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    const dlqCount = await this.dlq.getJobCounts();

    return {
      mainQueue: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
      deadLetterQueue: {
        total: dlqCount.waiting + dlqCount.completed + dlqCount.failed,
      },
    };
  }

  /**
   * Add single cascade job
   */
  async addSingleCascadeJob(
    entityType: string,
    entityId: string,
    newStatus: Status,
    userId: string,
  ): Promise<string> {
    return this.addBatchCascadeJob(
      [{ entityType, entityId, newStatus }],
      userId,
    );
  }

  /**
   * Get job status
   */
  async getCascadeJobStatus(jobId: string): Promise<CascadeJobStatus | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress() as number;
    const data = job.data;
    const result = job.returnvalue as BatchCascadeResult | undefined;

    return {
      id: job.id.toString(),
      status: state,
      progress,
      data,
      result,
      retryCount: job.attemptsMade || 0,
      failureReason: data.failureReason,
    };
  }

  async cancelBatchJob(batchId: string): Promise<boolean> {
    const job = await this.queue.getJob(batchId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return true;
    }

    return false;
  }

  // async getPendingJobs(): Promise<CascadeJobStatus[]> {
  //   const jobs = await this.queue.getJobs(['waiting', 'delayed', 'active']);

  //   return Promise.all(
  //     jobs.map(async (job) => {
  //       const state = await job.getState();
  //       const progress = (await job.progress()) as number;

  //       return {
  //         id: job.id.toString(),
  //         status: state,
  //         progress: progress,
  //         data: job.data,
  //         result: undefined,
  //       };
  //     }),
  //   );
  // }
}
