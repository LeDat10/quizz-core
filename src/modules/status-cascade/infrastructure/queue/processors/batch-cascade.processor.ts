import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { QUEUE_CONSTANTS } from '../../../../../shared/infrastructure/queues/constants/queue.constant';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { DataSource, EntityManager, In, QueryRunner } from 'typeorm';
import { StatusCascadeQueueService } from '../services/status-cascade-queue.service';
import { StatusCascadeBatchJob } from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';
import { Job } from 'bull';
import { Status, StatusImpactEngine } from 'src/shared/common/status';
import { EntityHierarchyConfig } from 'src/modules/status-cascade/domain/interfaces/entity-config.interface';
import {
  BatchCascadeResult,
  SingleCascadeResult,
} from '../../../../../shared/infrastructure/queues/interfaces/queue-job.interface';
import { getEntityConfig } from 'src/modules/status-cascade/domain/helpers/entity-config.helper';

@Processor(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE)
export class BatchCascadeProcessor {
  private readonly logger = new LoggerHelper(BatchCascadeProcessor.name);

  constructor(
    private readonly connection: DataSource,
    private readonly queueService: StatusCascadeQueueService,
  ) {}

  @Process('cascade-batch')
  async handleBatchCascade(
    job: Job<StatusCascadeBatchJob>,
  ): Promise<BatchCascadeResult> {
    const ctx: LoggerContext = {
      method: 'handleBatchCascade',
      entity: '',
    };

    this.logger.start(ctx);
    const { batchId, updates } = job.data;

    job.data.retryCount = job.attemptsMade;

    return this.connection.transaction(async (manager) => {
      const results: SingleCascadeResult[] = [];
      let totalUpdated = 0;
      let failedCount = 0;

      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        const progress = ((i + 1) / updates.length) * 100;
        await job.progress(progress);

        try {
          const result = await this.cascadeEntity(
            manager,
            update.entityType,
            update.entityId,
            update.newStatus,
          );

          totalUpdated += result.totalUpdated;
          results.push(result);
        } catch (error) {
          failedCount++;
          const errorMessage = (error as Error).message;

          results.push({
            entityType: update.entityType,
            entityId: update.entityId,
            totalUpdated: 0,
            error: errorMessage,
          });

          // If critical error (can't retry), throw immediately
          if (this.isCriticalError(error as Error)) {
            throw error;
          }
        }
      }

      if (failedCount > 0) {
        throw new Error(
          `Cascade batch partially failed: ${failedCount}/${updates.length} entities failed`,
        );
      }

      return {
        batchId,
        totalUpdated,
        results,
        processedCount: updates.length,
        failedCount: 0,
      };
    });
  }

  /*
   * Check if error is critical (should not retry)
   */
  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      'Unknown entity type',
      'not found',
      'Invalid status transition',
    ];

    return criticalErrors.some((msg) => error.message.includes(msg));
  }

  @OnQueueFailed()
  async handleFailedJob(job: Job<StatusCascadeBatchJob>, error: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.queueService.moveToDeadLetterQueue(job.data, error.message);
    }
  }

  private async cascadeEntity(
    manager: EntityManager,
    entityType: string,
    entityId: string,
    newStatus: Status,
  ): Promise<SingleCascadeResult> {
    const config = getEntityConfig(entityType);
    if (!config) throw new Error(`Unknown entity type: ${entityType}`);

    const entity = await manager.findOne(config.entityTarget, {
      where: { id: entityId },
      relations: config.childrenRelation ? [config.childrenRelation] : [],
    });

    if (!entity) throw new Error(`${entityType} ${entityId} not found`);

    if (!config.childrenRelation) {
      await manager.update(
        config.entityTarget,
        { id: entityId },
        { status: newStatus },
      );
      return { entityType, entityId, totalUpdated: 1, affectedIds: [entityId] };
    }

    const cascadeLevels = await this.buildCascadeLevels(
      manager,
      entity,
      config,
    );
    const result = await StatusImpactEngine.autoFixChildrenMultiLevel(
      manager.queryRunner as QueryRunner,
      newStatus,
      cascadeLevels,
      { dryRun: false },
    );

    return {
      entityType,
      entityId,
      totalUpdated: result.updatedCount,
      cascadedLevels: result.cascadedLevels,
      affectedIds: result.affectedIds,
    };
  }

  /**
   * Build cascade levels for entire hierarchy
   * Goes as deep as possible: category > course > chapter > lesson
   */
  private async buildCascadeLevels(
    manager: EntityManager,
    parentEntity: Record<string, any>,
    parentConfig: EntityHierarchyConfig,
  ): Promise<
    Array<{
      entityTarget: any;
      children: Array<Record<string, any>>;
    }>
  > {
    const levels: Array<{
      entityTarget: any;
      children: Array<Record<string, any>>;
    }> = [];

    // Level 1: Direct children
    const directChildren = (parentEntity[parentConfig.childrenRelation!] ||
      []) as Array<Record<string, any>>;

    if (directChildren.length === 0) {
      return levels;
    }

    const childConfig = getEntityConfig(parentConfig.childEntityName!);
    if (!childConfig) {
      return levels;
    }

    levels.push({
      entityTarget: childConfig.entityTarget,
      children: directChildren,
    });

    // Level 2: Grandchildren
    if (childConfig.childrenRelation && childConfig.childEntityName) {
      const childIds = directChildren.map((c) => c.id as string);
      const grandchildConfig = getEntityConfig(childConfig.childEntityName);

      if (!grandchildConfig) {
        return levels;
      }

      const grandchildren =
        childIds.length > 0
          ? await manager.find(grandchildConfig.entityTarget, {
              where: { [childConfig.childrenRelation]: In(childIds) },
            })
          : [];

      if (grandchildren.length > 0) {
        levels.push({
          entityTarget: grandchildConfig.entityTarget,
          children: grandchildren,
        });

        // Level 3: Great-grandchildren
        if (
          grandchildConfig.childrenRelation &&
          grandchildConfig.childEntityName
        ) {
          const grandchildIds = grandchildren.map((gc) => gc.id as string);
          const greatGrandchildConfig = getEntityConfig(
            grandchildConfig.childEntityName,
          );

          if (greatGrandchildConfig) {
            const greatGrandchildren =
              grandchildIds.length > 0
                ? await manager.find(greatGrandchildConfig.entityTarget, {
                    where: {
                      [grandchildConfig.childrenRelation]: In(grandchildIds),
                    },
                  })
                : [];

            if (greatGrandchildren.length > 0) {
              levels.push({
                entityTarget: greatGrandchildConfig.entityTarget,
                children: greatGrandchildren,
              });
            }
          }
        }
      }
    }

    return levels;
  }
}
