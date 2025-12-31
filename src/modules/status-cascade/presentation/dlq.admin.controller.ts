import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { DLQManagementService } from '../infrastructure/queue/services/dlq-management.service';

@Controller('admin/cascade-dlq')
export class DLQAdminController {
  constructor(private readonly dlqService: DLQManagementService) {}

  @Get()
  async listDLQJobs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: 'timestamp' | 'retryCount',
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.dlqService.getDLQJobs({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      sortBy: sortBy ?? 'timestamp',
      order: order ?? 'desc',
    });
  }

  /**
   * GET /admin/cascade-dlq/stats
   * Get DLQ statistics
   */
  @Get('stats')
  async getDLQStats() {
    return this.dlqService.getDLQStats();
  }

  /**
   * POST /admin/cascade-dlq/:jobId/retry
   * Retry single job from DLQ
   */
  @Post(':jobId/retry')
  async retryJob(@Param('jobId') jobId: string) {
    const newBatchId = await this.dlqService.retryFromDLQ(jobId);
    return {
      newBatchId,
      message: 'Job moved from DLQ and queued for retry',
    };
  }

  /**
   * POST /admin/cascade-dlq/bulk-retry
   * Retry multiple jobs from DLQ
   */
  @Post('bulk-retry')
  async bulkRetry(@Body() body: { jobIds: string[] }) {
    return this.dlqService.bulkRetryFromDLQ(body.jobIds);
  }

  /**
   * DELETE /admin/cascade-dlq/cleanup
   * Clean up old DLQ jobs
   */
  @Delete('cleanup')
  async cleanupDLQ(@Query('days') days?: string) {
    const olderThanDays = days ? parseInt(days, 10) : 30;
    const removedCount = await this.dlqService.cleanupDLQ(olderThanDays);
    return {
      removedCount,
      olderThanDays,
      message: `Removed ${removedCount} jobs older than ${olderThanDays} days`,
    };
  }
}
