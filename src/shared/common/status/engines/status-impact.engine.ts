// building-blocks/domain/engines/status-impact.engine.ts
import { QueryRunner, EntityTarget, ObjectLiteral } from 'typeorm';
import {
  analyzeStatusChangeImpact,
  getAllowedChildStatuses,
} from '../helpers/status-policy.helper';
import { Status } from '../enums/status.enum';
import { LoggerHelper } from '../../logging';
import {
  AutoFixChildrenOptions,
  CascadeLevel,
  CascadeLevelResult,
  StatusImpactResult,
} from '../interfaces/impact.interface';

export class StatusImpactEngine {
  private static readonly logger = new LoggerHelper('StatusImpactEngine');

  /**
   * Helper: Get entity name from target
   */
  private static getEntityName(entityTarget: EntityTarget<any>): string {
    if (typeof entityTarget === 'string') {
      return entityTarget;
    }

    if (typeof entityTarget === 'function') {
      return entityTarget.name;
    }

    return 'Unknown';
  }

  private static determineTargetStatus(parentStatus: Status): Status | null {
    const allowed = getAllowedChildStatuses(parentStatus);

    if (!allowed.length) {
      return null;
    }

    // Priority order (safest first)
    const priority = [
      Status.ARCHIVED,
      Status.INACTIVE,
      Status.DRAFT,
      Status.PUBLISHED,
    ];

    // Select the first status in the priority list that is in the allowed list.
    for (const status of priority) {
      if (allowed.includes(status)) {
        return status;
      }
    }

    // Fallback: Get the first status in allowed
    return allowed[0];
  }

  private static async autoFixChildrenSingleLevel<T extends ObjectLiteral>(
    queryRunner: QueryRunner,
    entityTarget: EntityTarget<T>,
    children: T[],
    newParentStatus: Status,
    options: AutoFixChildrenOptions = {},
  ) {
    const {
      statusFieldName = 'status',
      dryRun = false,
      additionalUpdates = {},
    } = options;

    const ctx = {
      method: 'autoFixChildrenSingleLevel',
      entity: this.getEntityName(entityTarget),
    };

    // 1. Early return if have not children
    if (!children?.length) {
      return {
        updatedCount: 0,
        affectedIds: [],
        targetStatus: null,
        reason: 'No children to update',
      };
    }

    try {
      const childStatuses = children.map(
        (child) => child[statusFieldName] as Status,
      );

      const impact = analyzeStatusChangeImpact(newParentStatus, childStatuses, {
        parentName: this.getEntityName(entityTarget),
        childName: 'children',
      });

      this.logger.debug(ctx, 'processing', 'Analyzing status impact', {
        newParentStatus,
        totalChildren: children.length,
        willMakeInaccessible: impact.willMakeInaccessible,
        affectedChildren: impact.affectedChildren,
      });

      // If it doesn't work, return soon.
      if (!impact.willMakeInaccessible) {
        return {
          updatedCount: 0,
          affectedIds: [],
          targetStatus: null,
          reason: 'No children need to be updated',
        };
      }

      // Identify the ones that need updating.
      const allowed = getAllowedChildStatuses(newParentStatus);
      const childrenToUpdate = children.filter(
        (child) => !allowed.includes(child[statusFieldName] as Status),
      );

      if (!childrenToUpdate.length) {
        return {
          updatedCount: 0,
          affectedIds: [],
          targetStatus: null,
          reason: 'All children already have allowed statuses',
        };
      }

      const toUpdateIds = childrenToUpdate.map((c) => c.id as string);

      // Determine the target status for updates.
      const targetStatus = this.determineTargetStatus(newParentStatus);

      if (!targetStatus) {
        this.logger.warn(ctx, 'failed', 'Could not determine target status', {
          newParentStatus,
          childrenCount: childrenToUpdate.length,
        });

        return {
          updatedCount: 0,
          affectedIds: [],
          targetStatus: null,
          reason: 'Could not determine appropriate target status',
        };
      }

      // 6. Dry run mode
      if (dryRun) {
        this.logger.info(ctx, 'processing', 'Dry run mode - no changes made', {
          wouldUpdateCount: toUpdateIds.length,
          targetStatus,
          affectedIds: toUpdateIds,
        });

        return {
          updatedCount: 0,
          affectedIds: toUpdateIds,
          targetStatus,
          reason: 'Dry run mode - no actual updates performed',
        };
      }

      // 7. run Update
      const updateData: Partial<T> = {
        [statusFieldName]: targetStatus,
        ...additionalUpdates,
      } as Partial<T>;

      await queryRunner.manager
        .createQueryBuilder()
        .update(entityTarget)
        .set(updateData)
        .where('id IN (:...ids)', { ids: toUpdateIds })
        .execute();

      this.logger.info(ctx, 'updated', undefined, {
        updatedCount: toUpdateIds.length,
        targetStatus,
        newParentStatus,
        affectedIds: toUpdateIds,
      });

      return {
        updatedCount: toUpdateIds.length,
        affectedIds: toUpdateIds,
        targetStatus,
        reason: `Updated ${toUpdateIds.length} children to ${targetStatus}`,
      };
    } catch (error: any) {
      this.logger.error(ctx, error as Error, 'failed', {
        newParentStatus,
        childrenCount: children.length,
      });
      throw error;
    }
  }

  static async autoFixChildrenMultiLevel(
    queryRunner: QueryRunner,
    rootParentStatus: Status,
    cascadeLevels: CascadeLevel<any>[],
    options: AutoFixChildrenOptions = {},
  ): Promise<StatusImpactResult> {
    const ctx = {
      method: 'autoFixChildrenMultiLevel',
      entity: '',
    };

    if (!cascadeLevels.length) {
      return {
        updatedCount: 0,
        affectedIds: [],
        targetStatus: null,
        reason: 'No cascade levels defined',
      };
    }

    const cascadedLevels: CascadeLevelResult[] = [];
    let totalUpdated = 0;
    let allAffectedIds: string[] = [];
    let currentParentStatus = rootParentStatus;

    try {
      // Xử lý từng level
      for (let i = 0; i < cascadeLevels.length; i++) {
        const level = cascadeLevels[i];
        const levelNumber = i + 1;

        this.logger.debug(
          ctx,
          'processing',
          `Processing level ${levelNumber}`,
          {
            entity: this.getEntityName(level.entityTarget),
            childrenCount: level.children?.length || 0,
            currentParentStatus,
          },
        );

        // Fix level hiện tại
        const levelResult = await this.autoFixChildrenSingleLevel(
          queryRunner,
          level.entityTarget,
          level.children || [],
          currentParentStatus,
          options,
        );

        // Track kết quả
        cascadedLevels.push({
          level: levelNumber,
          entityName: this.getEntityName(level.entityTarget),
          updatedCount: levelResult.updatedCount,
          affectedIds: levelResult.affectedIds,
          targetStatus: levelResult.targetStatus,
        });

        totalUpdated += levelResult.updatedCount;
        allAffectedIds = [...allAffectedIds, ...levelResult.affectedIds];

        if (
          i < cascadeLevels.length - 1 &&
          levelResult.affectedIds.length > 0
        ) {
          const nextLevel = cascadeLevels[i + 1];

          // Update parent status cho level tiếp theo
          currentParentStatus = levelResult.targetStatus || currentParentStatus;

          // Lấy children của những entity vừa được update
          if (nextLevel.getChildren) {
            const nextChildren = await nextLevel.getChildren(
              queryRunner,
              levelResult.affectedIds,
            );

            cascadeLevels[i + 1].children = nextChildren;

            this.logger.debug(
              ctx,
              'processing',
              `Fetched children for next level`,
              {
                currentLevel: levelNumber,
                nextLevel: levelNumber + 1,
                childrenCount: nextChildren.length,
              },
            );
          }
        }
      }

      const summary = cascadedLevels
        .map(
          (l) =>
            `L${l.level}(${l.entityName}): ${l.updatedCount} → ${l.targetStatus}`,
        )
        .join(', ');

      this.logger.info(ctx, 'completed', undefined, {
        totalUpdated,
        levels: cascadedLevels.length,
        summary,
      });

      return {
        updatedCount: totalUpdated,
        affectedIds: allAffectedIds,
        targetStatus: cascadedLevels[0]?.targetStatus || null,
        reason: `Cascaded ${cascadeLevels.length} levels: ${summary}`,
        cascadedLevels,
      };
    } catch (error) {
      this.logger.error(ctx, error as Error, 'failed', {
        rootParentStatus,
        levelsProcessed: cascadedLevels.length,
      });
      throw error;
    }
  }

  static async autoFixChildren<T extends ObjectLiteral>(
    queryRunner: QueryRunner,
    entityTarget: EntityTarget<T>,
    children: T[],
    newParentStatus: Status,
    options: AutoFixChildrenOptions = {},
  ): Promise<StatusImpactResult> {
    const result = await this.autoFixChildrenSingleLevel(
      queryRunner,
      entityTarget,
      children,
      newParentStatus,
      options,
    );

    return result;
  }
}
