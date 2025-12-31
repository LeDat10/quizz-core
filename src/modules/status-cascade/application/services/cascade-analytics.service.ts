import { Injectable } from '@nestjs/common';
import { StatusCascadeQueueService } from '../../infrastructure/queue/services/status-cascade-queue.service';
import { DLQManagementService } from '../../infrastructure/queue/services/dlq-management.service';

interface CascadeAnalytics {
  performance: {
    averageProcessingTime: number;
    successRate: number;
    retryRate: number;
  };
  usage: {
    totalBatches: number;
    batchApproachUsage: number;
    levelApproachUsage: number;
  };
  health: {
    currentLoad: number;
    dlqSize: number;
    failureRate: number;
  };
}

@Injectable()
export class CascadeAnalyticsService {
  constructor(
    private readonly queueService: StatusCascadeQueueService,
    private readonly dlqService: DLQManagementService,
  ) {}

  /**
   * Get comprehensive analytics
   */
  async getAnalytics(): Promise<CascadeAnalytics> {
    const [metrics, dlqStats] = await Promise.all([
      this.queueService.getQueueMetrics(),
      this.dlqService.getDLQStats(),
    ]);

    const totalCompleted =
      metrics.batchQueue.completed + metrics.levelQueue.completed;
    const totalFailed = metrics.batchQueue.failed + metrics.levelQueue.failed;
    const totalProcessed = totalCompleted + totalFailed;

    return {
      performance: {
        averageProcessingTime: 0, // Would calculate from job data
        successRate:
          totalProcessed > 0 ? (totalCompleted / totalProcessed) * 100 : 100,
        retryRate:
          dlqStats.total > 0 ? (dlqStats.total / totalProcessed) * 100 : 0,
      },
      usage: {
        totalBatches: totalCompleted,
        batchApproachUsage: metrics.batchQueue.completed,
        levelApproachUsage: metrics.levelQueue.completed,
      },
      health: {
        currentLoad: metrics.batchQueue.active + metrics.levelQueue.active,
        dlqSize: dlqStats.total,
        failureRate:
          totalProcessed > 0 ? (totalFailed / totalProcessed) * 100 : 0,
      },
    };
  }

  /**
   * Get recommendations based on usage patterns
   */
  async getRecommendations(): Promise<string[]> {
    const analytics = await this.getAnalytics();
    const recommendations: string[] = [];

    if (analytics.health.dlqSize > 100) {
      recommendations.push(
        'DLQ has many failed jobs. Review and retry or clean up old entries.',
      );
    }

    if (analytics.health.failureRate > 10) {
      recommendations.push(
        'High failure rate detected. Investigate common error patterns.',
      );
    }

    if (analytics.health.currentLoad > 1000) {
      recommendations.push(
        'High queue load. Consider scaling workers or optimizing processing.',
      );
    }

    if (
      analytics.usage.batchApproachUsage >
      analytics.usage.levelApproachUsage * 2
    ) {
      recommendations.push(
        'Batch approach is heavily used. Consider level-based for better scalability.',
      );
    }

    return recommendations.length > 0
      ? recommendations
      : ['System is healthy. No immediate actions required.'];
  }
}
