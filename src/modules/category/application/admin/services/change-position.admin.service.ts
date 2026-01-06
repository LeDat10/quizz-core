import { HttpException, Inject, Injectable } from '@nestjs/common';
import { CategoryRepository } from 'src/modules/category/domain/interfaces/category-repository.interface';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';
import { DataSource } from 'typeorm';
import { CategoryMapper } from '../mappers/category.mapper';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { ErrorHandlerHelper } from 'src/shared/common/errors';
import { AdminResponseCategoryDto } from '../dtos/admin-response-category.admin.dto';
import { BaseResponseDto, ResponseFactory } from 'src/shared/common/http';
import { CategoryNotFoundException } from '../../exceptions/category-not-found.exception';
import { ChangeCategoryPositionAdminDto } from '../dtos/change-position.admin.dto';
import { CategoryPositionConflictException } from '../../exceptions/position-conflict.exception';
import { CategoryPositionNotFoundException } from '../../exceptions/category-position-not-found.exception';
import { generateMessage } from 'src/shared/common/messaging';

@Injectable()
export class ChangeCategoryPositionAdminService {
  private logger: LoggerHelper;
  private errorHandler: ErrorHandlerHelper;

  private readonly ENTITY_NAME = 'Category';
  private readonly MAX_RETRIES = 5;
  private readonly LOCK_TTL = 5000;

  constructor(
    @Inject('CATEGORY_REPOSITORY')
    private readonly categoryRepository: CategoryRepository,

    private readonly connection: DataSource,

    private readonly redisService: RedisService,

    private readonly categoryMapper: CategoryMapper,
  ) {
    this.logger = new LoggerHelper(ChangeCategoryPositionAdminService.name);
    this.errorHandler = new ErrorHandlerHelper(
      ChangeCategoryPositionAdminService.name,
    );
  }

  async execute(
    id: string,
    dto: ChangeCategoryPositionAdminDto,
  ): Promise<BaseResponseDto<AdminResponseCategoryDto>> {
    const ctx: LoggerContext = {
      method: 'execute',
      entity: this.ENTITY_NAME,
    };

    const traceId = this.logger.start(ctx, {
      operation: 'updatePositionCategory',
    });

    let lockOldPositionKey: string | null = '';
    let lockOldPositionId: string | null = '';
    let lockNewPositionKey: string | null = '';
    let lockNewPositionId: string | null = '';

    this.logger.checkpoint(traceId, 'transaction-started', ctx);
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.checkpoint(traceId, 'validating-category', ctx);
      const category = await this.categoryRepository.findById(id);

      if (!category) {
        const reason = `Category with ID ${id} not found`;
        this.logger.error(ctx, reason, 'failed', { traceId });
        throw new CategoryNotFoundException(id);
      }

      this.logger.checkpoint(traceId, 'category-found', ctx, {
        categoryId: category.id,
        currentPosition: category.position,
      });

      this.logger.checkpoint(traceId, 'acquiring-old-position-lock', ctx, {
        position: category.position,
      });
      lockOldPositionKey = `category:update:position:${category.position}`;
      lockOldPositionId = await this.redisService.acquireRedisLockWithRetry(
        lockOldPositionKey,
        this.LOCK_TTL,
        this.MAX_RETRIES,
      );

      if (!lockOldPositionId) {
        this.logger.warn(ctx, 'failed', 'Failed to acquire position lock', {
          traceId,
          oldPosition: category.position,
          attempts: this.MAX_RETRIES,
        });
        throw new CategoryPositionConflictException(category.position);
      }

      this.logger.checkpoint(traceId, 'old-position-lock-acquired', ctx);

      this.logger.checkpoint(traceId, 'acquiring-new-position-lock', ctx, {
        position: dto.newPosition,
      });
      lockNewPositionKey = `category:update:position:${dto.newPosition}`;
      lockNewPositionId = await this.redisService.acquireRedisLockWithRetry(
        lockNewPositionKey,
        this.LOCK_TTL,
        this.MAX_RETRIES,
      );

      if (!lockNewPositionId) {
        this.logger.warn(ctx, 'failed', 'Failed to acquire position lock', {
          traceId,
          newPosition: dto.newPosition,
          attempts: this.MAX_RETRIES,
        });
        throw new CategoryPositionConflictException(dto.newPosition);
      }

      this.logger.checkpoint(traceId, 'new-position-lock-acquired', ctx);

      this.logger.checkpoint(traceId, 'finding-target-category', ctx, {
        targetPosition: dto.newPosition,
      });

      const targetCategory = await this.categoryRepository.findByPosition(
        dto.newPosition,
      );

      if (!targetCategory) {
        this.logger.error(
          ctx,
          `No category found at position ${dto.newPosition}`,
          'failed',
          { traceId },
        );
        throw new CategoryPositionNotFoundException(dto.newPosition);
      }

      this.logger.checkpoint(traceId, 'target-category-found', ctx, {
        targetCategoryId: targetCategory.id,
        targetPosition: targetCategory.position,
      });

      await queryRunner.startTransaction();

      this.logger.checkpoint(traceId, 'swapping-positions', ctx, {
        categoryAId: category.id,
        categoryAPosition: category.position,
        categoryBId: targetCategory.id,
        categoryBPosition: targetCategory.position,
      });

      const swapped = await this.categoryRepository.swapPositions(
        category,
        targetCategory,
        queryRunner,
      );

      category.position = swapped.categoryA.position;
      this.logger.checkpoint(traceId, 'committing-transaction', ctx);

      await queryRunner.commitTransaction();

      this.logger.success(
        {
          ...ctx,
          id: category.id,
        },
        traceId,
        'updated',
        {
          ...category,
        },
      );

      return ResponseFactory.success<AdminResponseCategoryDto>(
        this.categoryMapper.toAdminResponseDto(category),
        generateMessage('updated', this.ENTITY_NAME, category.id),
      );
    } catch (error) {
      this.logger.checkpoint(traceId, 'error-occurred', ctx, {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });

      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
        this.logger.checkpoint(traceId, 'transaction-rolled-back', ctx);
      }

      this.logger.fail(ctx, error as Error, traceId, 'failed');

      if (error instanceof HttpException) {
        throw error;
      }

      return this.errorHandler.handle(ctx, error, this.ENTITY_NAME);
    } finally {
      if (lockOldPositionId && lockOldPositionKey) {
        await this.redisService.releaseLock(
          lockOldPositionKey,
          lockOldPositionId,
        );
        this.logger.checkpoint(traceId, 'old-position-lock-released', ctx);
      }

      if (lockNewPositionId && lockNewPositionKey) {
        await this.redisService.releaseLock(
          lockNewPositionKey,
          lockNewPositionId,
        );
        this.logger.checkpoint(traceId, 'new-position-lock-released', ctx);
      }

      // Release query runner
      await queryRunner.release();
      this.logger.checkpoint(traceId, 'query-runner-released', ctx);
    }
  }
}
