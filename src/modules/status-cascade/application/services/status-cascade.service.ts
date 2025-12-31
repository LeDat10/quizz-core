import { Injectable } from '@nestjs/common';
import { StatusCascadeQueueService } from '../../infrastructure/queue/services/status-cascade-queue.service';
import { BulkCascadeDto, StartCascadeDto } from '../dtos/start-cascade.dto';
import { getMaxCascadeLevels } from '../../domain/helpers/entity-config.helper';
import { CascadeProgressDto } from '../dtos/cascade-progress.dto';
import { CancelBatchCascade } from '../../domain/interfaces/cascade-job.interface';

@Injectable()
export class StatusCascadeService {
  constructor(private readonly queueService: StatusCascadeQueueService) {}

  /**
   * Use Case: Update single entity with auto-decision
   * Smart selection between batch and level approach
   */
  async startCascade(
    dto: StartCascadeDto,
    userId: string,
  ): Promise<{ batchId: string; approach: string }> {
    const maxLevels = getMaxCascadeLevels(dto.entityType);

    // Business logic: Choose approach based on hierarchy depth
    const useLevelBased = maxLevels > 1; // Deep hierarchy

    const batchId = useLevelBased
      ? await this.queueService.startLevelBasedCascade(
          dto.entityType,
          dto.entityId,
          dto.newStatus,
          userId,
        )
      : await this.queueService.addBatchCascadeJob(
          [
            {
              entityType: dto.entityType,
              entityId: dto.entityId,
              newStatus: dto.newStatus,
            },
          ],
          userId,
        );

    return {
      batchId,
      approach: useLevelBased ? 'level-by-level' : 'batch',
    };
  }

  /**
   * Use Case: Bulk update multiple entities
   * Always use batch approach for multiple roots
   */
  async startBulkCascade(
    dto: BulkCascadeDto,
    userId: string,
  ): Promise<{ batchId: string }> {
    const batchId = await this.queueService.addBatchCascadeJob(
      dto.updates,
      userId,
    );

    return { batchId };
  }

  /**
   * Use Case: Check cascade progress
   */
  async getProgress(batchId: string): Promise<CascadeProgressDto> {
    const rawProgress = await this.queueService.getBatchProgress(batchId);

    const total = rawProgress.levelJobs.total;
    const completed = rawProgress.levelJobs.completed;
    const failed = rawProgress.levelJobs.failed;
    const active = rawProgress.levelJobs.active;

    return {
      batchId,
      isDone: active === 0 && total === completed + failed,
      progress: {
        total,
        completed,
        failed,
        active,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
      levels: rawProgress.levelJobs.byLevel,
    };
  }

  /**
   * Use Case: Cancel ongoing cascade
   */
  async cancelCascade(batchId: string): Promise<CancelBatchCascade> {
    return this.queueService.cancelBatchCascade(batchId);
  }
}
