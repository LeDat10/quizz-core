import { Injectable } from '@nestjs/common';
import { LoggerHelper } from 'src/shared/common/logging';
import { StatusCascadeQueueService } from './status-cascade-queue.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QueueCleanupJobService {
  private readonly logger = new LoggerHelper(QueueCleanupJobService.name);
  constructor(private readonly cascadeQueue: StatusCascadeQueueService) {}

  /**
   * Clean up completed jobs every hour
   * Keeps last 1 hour of completed jobs
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupCompletedJobs() {
    const ctx = { method: 'cleanupCompletedJobs', entity: '' };

    try {
      this.logger.start(ctx);

      const result = await this.cascadeQueue.cleanupCompletedJobs(1); // 1 hour

      this.logger.info(ctx, 'completed', undefined, {
        batchQueueCleaned: result.batchQueue,
        levelQueueCleaned: result.levelQueue,
        totalCleaned: result.total,
      });
    } catch (error) {
      this.logger.error(ctx, error as Error, 'failed');
    }
  }

  /**
   * Clean up old failed jobs daily
   * Keeps last 7 days of failed jobs for debugging
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldFailedJobs() {
    const ctx = { method: 'cleanupOldFailedJobs', entity: '' };

    try {
      this.logger.start(ctx);

      const result = await this.cascadeQueue.cleanupOldFailedJobs(7); // 7 days

      this.logger.info(ctx, 'completed', undefined, {
        batchQueueCleaned: result.batchQueue,
        levelQueueCleaned: result.levelQueue,
        // dlqCleaned: result.dlq,
        totalCleaned: result.total,
      });
    } catch (error) {
      this.logger.error(ctx, error as Error, 'failed');
    }
  }

  /**
   * Log retention statistics every 6 hours
   * Monitor memory usage
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async logRetentionStats() {
    const ctx = { method: 'logRetentionStats', entity: '' };

    try {
      const stats = await this.cascadeQueue.getJobRetentionStats();

      this.logger.info(ctx, 'start', undefined, {
        batchQueue: stats.batchQueue,
        levelQueue: stats.levelQueue,
        dlq: stats.dlq,
      });

      // Alert if too many jobs accumulated
      const totalCompleted =
        stats.batchQueue.completed.total + stats.levelQueue.completed.total;
      const totalFailed =
        stats.batchQueue.failed.total +
        stats.levelQueue.failed.total +
        stats.dlq.total;

      if (totalCompleted > 10000) {
        this.logger.warn(ctx, 'completed', undefined, {
          totalCompleted,
          message: 'Consider more frequent cleanup',
        });
      }

      if (totalFailed > 1000) {
        this.logger.warn(ctx, 'failed', undefined, {
          totalFailed,
          message: 'Investigate recurring failures',
        });
      }
    } catch (error) {
      this.logger.error(ctx, error as Error, 'failed');
    }
  }
}
