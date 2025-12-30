import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { QueueAdminController } from './presentation/queue.admin.controller';
import { QUEUE_CONSTANTS } from 'src/shared/infrastructure/queues/constants/queue.constant';
import { ScheduleModule } from '@nestjs/schedule';
import { StatusCascadeQueueService } from './infrastructure/queue/services/status-cascade-queue.service';
import { StatusCascadeService } from './application/services/status-cascade.service';

@Module({
  imports: [
    // Enable scheduling for cron jobs
    ScheduleModule.forRoot(),

    // Register all queues
    BullModule.registerQueue({
      name: QUEUE_CONSTANTS.NAMES.STATUS_CASCADE,
      defaultJobOptions: {
        removeOnComplete: true, // Auto-remove completed jobs
        removeOnFail: false, // Keep failed jobs
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL,
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Keep for 1 hour
          count: 1000, // Keep max 1000 jobs
        },
        removeOnFail: false, // Keep failed jobs
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_DLQ,
      defaultJobOptions: {
        removeOnComplete: false, // Never auto-remove DLQ jobs
        removeOnFail: false,
      },
    }),
  ],
  providers: [StatusCascadeQueueService, StatusCascadeService],
  exports: [StatusCascadeQueueService],
  controllers: [QueueAdminController],
})
export class StatusCascadeModule {}
