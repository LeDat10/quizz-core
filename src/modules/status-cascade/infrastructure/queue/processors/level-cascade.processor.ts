import { InjectQueue, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import {
  EntityInstance,
  EntityTypeMap,
  QUEUE_CONSTANTS,
} from '../../../../../shared/infrastructure/queues/constants/queue.constant';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { DataSource } from 'typeorm';
import { Job, Queue } from 'bull';
import { StatusCascadeLevelJob } from 'src/modules/status-cascade/domain/interfaces/cascade-job.interface';
import { getEntityConfig } from 'src/modules/status-cascade/domain/helpers/entity-config.helper';
import { NotFoundException } from '@nestjs/common';
import {
  getAllowedChildStatuses,
  Status,
  StatusImpactEngine,
} from 'src/shared/common/status';
import { LevelCascadeResult } from '../../../../../shared/infrastructure/queues/interfaces/queue-job.interface';
import { StatusCascadeQueueService } from '../services/status-cascade-queue.service';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';

@Processor(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL)
export class LevelCascadeProcessor {
  private readonly logger = new LoggerHelper(LevelCascadeProcessor.name);

  constructor(
    private readonly connection: DataSource,
    @InjectQueue(QUEUE_CONSTANTS.NAMES.STATUS_CASCADE_LEVEL)
    private levelQueue: Queue<StatusCascadeLevelJob>,

    private readonly cascadeQueue: StatusCascadeQueueService,

    private readonly redisService: RedisService,
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

    const lockKey = `update:${entityType}:${entityId}`;
    let lockId: string | null = '';

    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();

    try {
      lockId = await this.redisService.acquireRedisLockWithRetry(lockKey);

      await queryRunner.startTransaction();

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

      // 7. Commit transaction (entity + direct children updated atomically)
      await queryRunner.commitTransaction();

      // 8. Create next level jobs (OUTSIDE transaction)
      // This is safe - if job creation fails, we can retry without affecting DB
      let nextLevelJobsCreated = 0;
      if (config.childrenRelation && childConfig.childEntityName) {
        const childrenRaw = (entity as Record<string, unknown>)[
          config.childrenRelation
        ];

        if (
          childrenRaw &&
          Array.isArray(childrenRaw) &&
          childrenRaw.length > 0
        ) {
          const childName = childConfig.childEntityName as keyof EntityTypeMap;
          console.log(childName);
          type ChildType = EntityInstance<typeof childName>;

          nextLevelJobsCreated = await this.createNextLevelJobs<ChildType>(
            job.data,
            childrenRaw as ChildType[],
            childConfig.childEntityName,
            newStatus,
          );
        }
      }

      await job.progress(100);

      return {
        entityId,
        entityType,
        level,
        directChildrenUpdated: 0,
        affectedChildIds: [],
        targetStatus: newStatus,
        nextLevelJobsCreated,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(ctx, error as Error, 'failed');
      throw error;
    } finally {
      await queryRunner.release();

      if (lockId) {
        await this.redisService.releaseLock(lockKey, lockId);
      }
    }
  }

  /**
   * Create jobs for next level (children of updated entities)
   */
  private async createNextLevelJobs<T extends { id: string; status: Status }>(
    parentJob: StatusCascadeLevelJob,
    children: T[],
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

    const batches = this.chunkArray(children, BATCH_SIZE);
    const allowed = getAllowedChildStatuses(newStatus);
    let totalJobsCreated = 0;

    for (const batch of batches) {
      const jobs = batch
        .filter((child) => !allowed.includes(child.status))
        .map((child) => {
          const targetStatus =
            StatusImpactEngine.determineTargetStatus(newStatus);
          return {
            name: 'cascade-level',
            data: {
              batchId,
              parentJobId,
              level: nextLevel,
              entityType: childEntityType,
              entityId: child.id,
              newStatus,
              parentStatus: targetStatus,
              userId: parentJob.userId,
              metadata: {
                ...metadata,
                currentPath: `${metadata?.currentPath} > ${childEntityType}-${child.id}`,
              },
            } as StatusCascadeLevelJob,
            opts: {
              jobId: `${batchId}-L${nextLevel}-${childEntityType}-${child.status}`,
              priority: nextLevel, // Lower priority for deeper levels
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            },
          };
        });

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

  @OnQueueFailed()
  async handleFailedJob(job: Job<StatusCascadeLevelJob>, error: Error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.cascadeQueue.moveToDeadLetterQueue(job.data, error.message);
      await job.remove();
    }
  }
}
