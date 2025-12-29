import { Process, Processor } from '@nestjs/bull';
import { STATUS_CASCADE_QUEUE } from './status-cascade.constant';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { DataSource, EntityManager, In, QueryRunner } from 'typeorm';
import { Job } from 'bull';
import {
  BatchCascadeResult,
  EntityHierarchyConfig,
  SingleCascadeResult,
  StatusCascadeBatchJob,
} from './status-cascade.interface';
import { Status, StatusImpactEngine } from 'src/shared/common/status';
import { getEntityConfig } from './status-cascade.helper';

@Processor(STATUS_CASCADE_QUEUE)
export class StatusCascadeProcessor {
  private readonly logger = new LoggerHelper(StatusCascadeProcessor.name);

  constructor(private readonly connection: DataSource) {}

  /**
   * Xử lý BATCH cascade - Xử lý nhiều updates trong 1 transaction
   */
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

          // Nếu là lỗi critical (không thể retry), throw ngay
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

  /**
   * Check if error is critical (không nên retry)
   */
  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      'Unknown entity type',
      'not found',
      'Invalid status transition',
    ];

    return criticalErrors.some((msg) => error.message.includes(msg));
  }

  /**
   * Generic cascade method
   */
  private async cascadeEntity(
    manager: EntityManager,
    entityType: string,
    entityId: string,
    newStatus: Status,
  ): Promise<SingleCascadeResult> {
    const config = getEntityConfig(entityType);

    if (!config) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const relations = config.childrenRelation ? [config.childrenRelation] : [];
    const entity = await manager.findOne(config.entityTarget, {
      where: { id: entityId },
      relations,
    });

    if (!entity) {
      throw new Error(`${config.entityTarget} ${entityId} not found`);
    }

    if (!config.childrenRelation || !config.childEntityName) {
      await manager.update(
        config.entityTarget,
        { id: entityId },
        {
          status: newStatus,
        },
      );

      return {
        entityType,
        entityId,
        totalUpdated: 1,
        affectedIds: [entityId],
      };
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
   * Build cascade levels
   */
  private async buildCascadeLevels(
    manager: EntityManager,
    parentEntity: Record<string, any>,
    parentConfig: EntityHierarchyConfig,
  ): Promise<
    Array<{
      entityTarget: string;
      children: Array<Record<string, any>>;
    }>
  > {
    const levels: Array<{
      entityTarget: string;
      children: Array<Record<string, any>>;
    }> = [];

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

    if (childConfig.childrenRelation && childConfig.childEntityName) {
      const childIds = directChildren.map(
        (c: Record<string, any>) => c.id as string,
      );
      const grandchildConfig = getEntityConfig(childConfig.childEntityName);

      if (!grandchildConfig) {
        return levels;
      }

      const grandchildren =
        childIds.length > 0
          ? ((await manager.find(grandchildConfig.entityTarget, {
              where: { [childConfig.childrenRelation]: In(childIds) },
            })) as Array<Record<string, any>>)
          : [];

      if (grandchildren.length > 0) {
        levels.push({
          entityTarget: grandchildConfig.entityTarget,
          children: grandchildren,
        });

        if (
          grandchildConfig.childrenRelation &&
          grandchildConfig.childEntityName
        ) {
          const grandchildIds = grandchildren.map(
            (gc: Record<string, any>) => gc.id as string,
          );
          const greatGrandchildConfig = getEntityConfig(
            grandchildConfig.childEntityName,
          );

          if (greatGrandchildConfig) {
            const greatGrandchildren =
              grandchildIds.length > 0
                ? ((await manager.find(greatGrandchildConfig.entityTarget, {
                    where: {
                      [grandchildConfig.childrenRelation]: In(grandchildIds),
                    },
                  })) as Array<Record<string, any>>)
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
