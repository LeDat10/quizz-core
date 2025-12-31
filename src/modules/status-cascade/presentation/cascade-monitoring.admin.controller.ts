import { Controller, Get, Query } from '@nestjs/common';
import { StatusCascadeQueueService } from '../infrastructure/queue/services/status-cascade-queue.service';

@Controller('admin/cascade/monitoring')
export class CascadeMonitoringController {
  constructor(private readonly queueService: StatusCascadeQueueService) {}

  /**
   * GET /cascade/monitoring/health
   * Queue health check (for load balancers)
   */
  @Get('health')
  async healthCheck() {
    const metrics = await this.queueService.getQueueMetrics();

    const totalActive = metrics.batchQueue.active + metrics.levelQueue.active;
    const totalWaiting =
      metrics.batchQueue.waiting + metrics.levelQueue.waiting;

    const isHealthy = totalActive < 1000 && totalWaiting < 5000;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      metrics: {
        active: totalActive,
        waiting: totalWaiting,
        failed: metrics.batchQueue.failed + metrics.levelQueue.failed,
      },
    };
  }

  /**
   * GET /cascade/monitoring/metrics
   * Detailed queue metrics
   */
  @Get('metrics')
  async getMetrics() {
    return await this.queueService.getQueueMetrics();
  }

  /**
   * GET /cascade/monitoring/batches/recent
   * Get recent batch operations
   */
  @Get('batches/recent')
  getRecentBatches(@Query('limit') limit?: string) {
    const maxLimit = limit ? parseInt(limit, 10) : 20;

    // Implementation would fetch recent batches from queue
    // This is a placeholder
    return {
      batches: [],
      limit: maxLimit,
    };
  }
}
