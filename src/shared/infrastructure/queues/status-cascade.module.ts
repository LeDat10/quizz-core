import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import {
  STATUS_CASCADE_DLQ,
  STATUS_CASCADE_QUEUE,
} from './status-cascade.constant';
import { StatusCascadeQueue } from './status-cascade.queue';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: STATUS_CASCADE_QUEUE,
        defaultJobOptions: {
          attempts: 3, // Retry 3 lần
          backoff: {
            type: 'exponential',
            delay: 2000, // 2s, 4s, 8s
          },
          removeOnComplete: true,
          removeOnFail: false, // Giữ failed jobs để debug
        },
      },
      {
        name: STATUS_CASCADE_DLQ, // Dead Letter Queue
        defaultJobOptions: {
          removeOnComplete: false, // Giữ lại để admin xử lý
          removeOnFail: false,
        },
      },
    ),
  ],
  providers: [StatusCascadeQueue],
  exports: [StatusCascadeQueue],
})
export class StatusCascadeModule {}
