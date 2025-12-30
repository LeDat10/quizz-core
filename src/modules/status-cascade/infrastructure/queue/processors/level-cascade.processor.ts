import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { QUEUE_CONSTANTS } from '../../../../../shared/infrastructure/queues/constants/queue.constant';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { DataSource } from 'typeorm';
import { Job, Queue } from 'bull';
import { StatusCascadeLevelJob } from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';
import { getEntityConfig } from 'src/modules/status-cascade/domain/helpers/entity-config.helper';
import { NotFoundException } from '@nestjs/common';
import { Status, StatusImpactEngine } from 'src/shared/common/status';
import { LevelCascadeResult } from '../../../../../shared/infrastructure/queues/interfaces/queue-job.interface';

@Processor(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL)
export class LevelCascadeProcessor {
  private readonly logger = new LoggerHelper(LevelCascadeProcessor.name);

  constructor(
    private readonly connection: DataSource,
    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL)
    private levelQueue: Queue<StatusCascadeLevelJob>,
  ) {}

  /**
   * Process single level - ATOMIC operation
   * Updates entity + direct children only in one transaction
   */
  @Process('cascade-level')
  async handleLevelCascade(
    job: Job<StatusCascadeLevelJob>,
  ): Promise<LevelCascadeResult> {
    const ctx: LoggerContext = {
      method: 'handleLevelCascade',
      entity: job.data.entityType,
    };

    this.logger.start(ctx);

    const { level, entityType, entityId, newStatus } = job.data;

    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const config = getEntityConfig(entityType);
      if (!config) {
        throw new NotFoundException(`Unknown entity type: ${entityType}`);
      }

      // 2. Load entity with direct children only
      const entity = await queryRunner.manager.findOne(config.entityTarget, {
        where: { id: entityId },
        relations: config.childrenRelation ? [config.childrenRelation] : [],
      });

      if (!entity) {
        throw new Error(`${entityType} ${entityId} not found`);
      }

      // 3. Update current entity
      await queryRunner.manager.update(
        config.entityTarget,
        { id: entityId },
        { status: newStatus },
      );

      this.logger.info(ctx, 'updated', undefined, {
        entityId,
        newStatus,
      });

      // 4. If no children, done!
      if (!config.childrenRelation || !config.childEntityName) {
        await queryRunner.commitTransaction();

        return {
          entityId,
          entityType,
          level,
          directChildrenUpdated: 0,
          affectedChildIds: [],
          targetStatus: newStatus,
          nextLevelJobsCreated: 0,
        };
      }

      // 5. Get direct children
      const directChildren = (entity[config.childrenRelation] || []) as Array<
        Record<string, any>
      >;

      if (directChildren.length === 0) {
        await queryRunner.commitTransaction();

        return {
          entityId,
          entityType,
          level,
          directChildrenUpdated: 0,
          affectedChildIds: [],
          targetStatus: newStatus,
          nextLevelJobsCreated: 0,
        };
      }

      // 6. Auto-fix direct children ONLY (atomic in same transaction)
      const childConfig = getEntityConfig(config.childEntityName);
      if (!childConfig) {
        await queryRunner.commitTransaction();
        return {
          entityId,
          entityType,
          level,
          directChildrenUpdated: 0,
          affectedChildIds: [],
          targetStatus: newStatus,
          nextLevelJobsCreated: 0,
        };
      }

      const result = await StatusImpactEngine.autoFixChildren(
        queryRunner,
        childConfig.entityTarget,
        directChildren,
        newStatus,
        { dryRun: false },
      );

      this.logger.info(ctx, 'updated', undefined, {
        childrenUpdated: result.updatedCount,
        targetStatus: result.targetStatus,
      });

      // 7. Commit transaction (entity + direct children updated atomically)
      await queryRunner.commitTransaction();

      // 8. Create next level jobs (OUTSIDE transaction)
      // This is safe - if job creation fails, we can retry without affecting DB
      let nextLevelJobsCreated = 0;
      if (result.affectedIds.length > 0 && childConfig.childEntityName) {
        nextLevelJobsCreated = await this.createNextLevelJobs(
          job.data,
          result.affectedIds,
          childConfig.childEntityName,
          result.targetStatus || newStatus,
        );
      }

      await job.progress(100);

      return {
        entityId,
        entityType,
        level,
        directChildrenUpdated: result.updatedCount,
        affectedChildIds: result.affectedIds,
        targetStatus: result.targetStatus,
        nextLevelJobsCreated,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(ctx, error as Error, 'failed');
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Create jobs for next level (children of updated entities)
   */
  private async createNextLevelJobs(
    parentJob: StatusCascadeLevelJob,
    childIds: string[],
    childEntityType: string,
    newStatus: Status,
  ): Promise<number> {
    const { batchId, level, metadata, entityType, entityId } = parentJob;
    const nextLevel = level + 1;

    // Check if we've reached max levels
    if (metadata && nextLevel > metadata.totalLevels) {
      return 0;
    }
    // Current job's ID becomes the parentJobId for next level
    const parentJobId = `${batchId}-L${level}-${entityType}-${entityId}`;
    // Create jobs in batches to avoid overwhelming queue
    const BATCH_SIZE = 50;
    const batches = this.chunkArray(childIds, BATCH_SIZE);

    let totalJobsCreated = 0;

    for (const batch of batches) {
      const jobs = batch.map((childId) => ({
        name: 'cascade-level',
        data: {
          batchId,
          parentJobId,
          level: nextLevel,
          entityType: childEntityType,
          entityId: childId,
          newStatus,
          parentStatus: newStatus,
          userId: parentJob.userId,
          metadata: {
            ...metadata,
            currentPath: `${metadata?.currentPath} > ${childEntityType}-${childId}`,
          },
        } as StatusCascadeLevelJob,
        opts: {
          jobId: `${batchId}-L${nextLevel}-${childEntityType}-${childId}`,
          priority: nextLevel, // Lower priority for deeper levels
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }));

      await this.levelQueue.addBulk(jobs);
      totalJobsCreated += batch.length;
    }

    this.logger.info(
      { method: 'createNextLevelJobs', entity: childEntityType },
      'created',
      undefined,
      {
        batchId,
        level: nextLevel,
        jobsCreated: totalJobsCreated,
      },
    );

    return totalJobsCreated;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
