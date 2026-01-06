import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QueueAdminController } from './presentation/queue.admin.controller';
import { QUEUE_CONSTANTS } from 'src/shared/infrastructure/queues/constants/queue.constant';
import { ScheduleModule } from '@nestjs/schedule';
import { StatusCascadeQueueService } from './infrastructure/queue/services/status-cascade-queue.service';
import { StatusCascadeService } from './application/services/status-cascade.service';
import { CascadeMonitoringController } from './presentation/cascade-monitoring.admin.controller';
import { DLQAdminController } from './presentation/dlq.admin.controller';
import { CascadeAnalyticsService } from './application/services/cascade-analytics.service';
import { DLQManagementService } from './infrastructure/queue/services/dlq-management.service';
import { BatchCascadeProcessor } from './infrastructure/queue/processors/batch-cascade.processor';
import { LevelCascadeProcessor } from './infrastructure/queue/processors/level-cascade.processor';
import { QueueCleanupJobService } from './infrastructure/queue/services/cleanup.service';
import { RedisModule } from 'src/shared/infrastructure/redis/redis.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),

    // Register all queues
    BullModule.registerQueue({
      name: QUEUE_CONSTANTS.NAMES.STATUS_CASCADE,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.BACKOFF_DELAY,
        },
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL,
      defaultJobOptions: {
        removeOnComplete: {
          age: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.RETENTION.COMPLETED_AGE,
          count: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.RETENTION.COMPLETED_COUNT,
        },
        removeOnFail: false,
        attempts: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: QUEUE_CONSTANTS.DEFAULT_JOB_OPTIONS.BACKOFF_DELAY,
        },
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_DLQ,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    }),
    RedisModule,
  ],

  controllers: [
    // User-facing APIs
    // StatusCascadeController,
    CascadeMonitoringController,

    // Admin APIs
    QueueAdminController,
    DLQAdminController,
  ],

  providers: [
    // Application Services (Business Logic)
    StatusCascadeService,
    CascadeAnalyticsService,

    // Infrastructure Services (Technical)
    StatusCascadeQueueService,
    DLQManagementService,

    // Processors
    BatchCascadeProcessor,
    LevelCascadeProcessor,

    // Scheduled Jobs
    QueueCleanupJobService,
  ],

  exports: [
    // Export main service for other modules
    StatusCascadeService,
    CascadeAnalyticsService,
  ],
})
export class StatusCascadeModule {}
