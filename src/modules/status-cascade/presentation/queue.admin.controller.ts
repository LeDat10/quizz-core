import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { StatusCascadeQueueService } from '../infrastructure/queue/services/status-cascade-queue.service';

@Controller('admin/queues')
export class QueueAdminController {
  constructor(private readonly cascadeQueue: StatusCascadeQueueService) {}

  /**
   * GET /admin/queues/metrics
   * Get current queue statistics
   */
  @Get('metrics')
  async getMetrics() {
    return this.cascadeQueue.getQueueMetrics();
  }

  /**
   * GET /admin/queues/retention-stats
   * Get job retention statistics
   */
  @Get('retention-stats')
  async getRetentionStats() {
    return this.cascadeQueue.getJobRetentionStats();
  }

  /**
   * GET /admin/queues/failed-jobs
   * Get all failed jobs for review
   */
  @Get('failed-jobs')
  async getFailedJobs() {
    return this.cascadeQueue.getAllFailedJobs();
  }

  /**
   * POST /admin/queues/cleanup/completed
   * Manual cleanup of completed jobs
   */
  @Post('cleanup/completed')
  async cleanupCompleted(@Query('hours') hours?: string) {
    const olderThanHours = hours ? parseInt(hours, 10) : 24;
    return this.cascadeQueue.cleanupCompletedJobs(olderThanHours);
  }

  /**
   * POST /admin/queues/cleanup/failed
   * Manual cleanup of old failed jobs
   */
  @Post('cleanup/failed')
  async cleanupFailed(@Query('days') days?: string) {
    const olderThanDays = days ? parseInt(days, 10) : 7;
    return this.cascadeQueue.cleanupOldFailedJobs(olderThanDays);
  }

  /**
   * POST /admin/queues/retry/:queueType/:jobId
   * Retry a specific failed job
   */
  @Post('retry/:queueType/:jobId')
  async retryJob(
    @Param('queueType') queueType: 'batch' | 'level',
    @Param('jobId') jobId: string,
  ) {
    const retriedJobId = await this.cascadeQueue.retryFailedJob(
      queueType,
      jobId,
    );
    return { retriedJobId, message: 'Job queued for retry' };
  }

  /**
   * DELETE /admin/queues/batch/:batchId
   * Cancel all pending jobs in a batch
   */
  @Delete('batch/:batchId')
  async cancelBatch(@Param('batchId') batchId: string) {
    return this.cascadeQueue.cancelBatchCascade(batchId);
  }

  // /**
  //  * POST /admin/queues/dlq/retry/:jobId
  //  * Retry job from Dead Letter Queue
  //  */
  // @Post('dlq/retry/:jobId')
  // async retryFromDLQ(@Param('jobId') jobId: string) {
  //   const newBatchId = await this.cascadeQueue.retryFromDLQ(jobId);
  //   return { newBatchId, message: 'Job moved from DLQ and queued for retry' };
  // }

  // /**
  //  * GET /admin/queues/dlq
  //  * Get all DLQ jobs
  //  */
  // @Get('dlq')
  // async getDLQJobs() {
  //   return this.cascadeQueue.getDLQJobs();
  // }
}
