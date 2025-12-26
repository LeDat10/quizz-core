import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CategoryRepository } from 'src/modules/category/domain/interfaces/category-repository.interface';
import { ErrorHandlerHelper } from 'src/shared/common/errors';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { AdminUpdateCategoryDto } from '../dtos/admin-update-category.admin.dto';
import { AdminResponseCategoryDto } from '../dtos/admin-response-category.admin.dto';
import { DataSource } from 'typeorm';
import { SlugService } from 'src/shared/common/slugs/slug.service';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';
import { CategoryMapper } from '../mappers/category.mapper';
import { StatusValidationService } from 'src/shared/common/status/services/status-validation.service';
import { Category } from 'src/modules/category/domain/entities/category.entity';

@Injectable()
export class UpdateCategoryAdminService {
  private logger: LoggerHelper;
  private errorHandler: ErrorHandlerHelper;
  private readonly ENTITY_NAME = 'Category';
  private readonly MAX_RETRIES = 5;
  private readonly LOCK_TTL = 5000;
  constructor(
    @Inject('CATEGORY_REPOSITORY')
    // repository
    private readonly categoryRepository: CategoryRepository,
    private readonly connection: DataSource,

    // services
    private readonly slugService: SlugService,
    private readonly redisService: RedisService,
    private readonly statusValidationService: StatusValidationService,

    // helpers
    private readonly categoryMapper: CategoryMapper,
  ) {
    this.logger = new LoggerHelper(UpdateCategoryAdminService.name);
    this.errorHandler = new ErrorHandlerHelper(UpdateCategoryAdminService.name);
  }

  async excute(
    id: string,
    dto: AdminUpdateCategoryDto,
  ): Promise<AdminResponseCategoryDto> {
    const ctx: LoggerContext = {
      method: 'execute',
      entity: 'Category',
    };

    const traceId = this.logger.start(ctx, {
      operation: 'updateCategory',
      title: dto.title,
    });

    try {
      if (!dto) {
        const reason = 'UpdateCategoryDto is null or undefined';
        this.logger.error(ctx, reason, 'created');
        throw new HttpException(reason, 400);
      }
    } catch (error) {
      this.errorHandler.handle(ctx, error, this.ENTITY_NAME);
    }

    this.logger.info(ctx, 'processing', 'Validating category data', {
      traceId: traceId,
      title: dto.title,
      description: dto.description ? 'provided' : 'not provided',
    });

    this.logger.checkpoint(traceId, 'transaction-started', ctx);

    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let lockSlugId: string | null = null;
    let lockSlugKey: string | null = null;
    let lockPositionId: string | null = null;
    let lockPositionKey: string | null = null;
    try {
      const category = await this.categoryRepository.findById(id);
      if (!category) {
        const reason = `Category with ID ${id} not found`;
        this.logger.error(ctx, reason, 'failed', { traceId });
        throw new HttpException(reason, 404);
      }

      let prepareCategory = category;
      let slugUpdate: string = category.slug;

      if (dto.status) {
        this.statusValidationService.validateTransition<Category>(
          prepareCategory,
          dto.status,
          { entityName: 'Category' },
        );

        this.statusValidationService.validateWithChildren<Category>(
          prepareCategory,
          dto.status,
          {
            entityName: this.ENTITY_NAME,
          },
        );
      }

      if (dto.position) {
        // Acquire position lock
        this.logger.info(ctx, 'processing', 'Acquiring position lock', {
          traceId,
        });

        lockPositionKey = `category:position${dto.position}`;
        lockPositionId = await this.redisService.acquireRedisLockWithRetry(
          lockPositionKey,
          this.LOCK_TTL,
          this.MAX_RETRIES,
        );

        if (!lockPositionId) {
          this.logger.warn(ctx, 'failed', 'Failed to acquire position lock', {
            traceId,
            attempts: this.MAX_RETRIES,
          });

          throw new ConflictException(
            'Unable to acquire lock for position. Please try again.',
          );
        }

        this.logger.checkpoint(traceId, 'position-lock-acquired', ctx);

        const recordWithPosition = await this.categoryRepository.findByPosition(
          dto.position,
        );

        if (!recordWithPosition) {
          this.logger.error(
            ctx,
            `No category found at position ${dto.position}`,
            'failed',
            { traceId },
          );
          throw new HttpException(
            `No category found at position ${dto.position}`,
            404,
          );
        }

        if (!recordWithPosition && lockPositionId && lockPositionKey) {
          await this.redisService.releaseLock(lockPositionKey, lockPositionId);
          this.logger.debug(ctx, 'processing', 'Max position lock released', {
            traceId,
            lockKey: lockPositionId,
          });
        }

        const swaped = await this.categoryRepository.swapPositions(
          category,
          recordWithPosition,
          queryRunner,
        );

        if (swaped.categoryA.id === category.id) {
          prepareCategory = swaped.categoryA;
        } else {
          prepareCategory = swaped.categoryB;
        }
      }

      if (dto.title) {
        // Generate unique slug
        this.logger.checkpoint(traceId, 'generating-slug', ctx, {
          title: dto.title,
        });

        const { slug, lockKey, lockId } =
          await this.slugService.generateUniqueSlug(
            dto.title,
            queryRunner,
            ctx,
            traceId,
            async (slug: string) => {
              const existing = await this.categoryRepository.findBySlug(slug);
              return existing !== null;
            },
          );

        lockSlugKey = lockKey;
        lockSlugId = lockId;

        this.logger.checkpoint(traceId, 'slug-generated', ctx, {
          slug,
        });

        slugUpdate = slug;
      }

      const categoryMapped = this.categoryMapper.fromUpdateDto(
        prepareCategory,
        dto,
      );

      categoryMapped.slug = slugUpdate;

      const updatedCategory = await queryRunner.manager.save(categoryMapped);

      await queryRunner.commitTransaction();

      this.logger.checkpoint(traceId, 'transaction-committed', ctx);

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

      return this.categoryMapper.toAdminResponseDto(updatedCategory);
    } catch (error) {
      this.logger.checkpoint(traceId, 'error-occurred', ctx, {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });

      await queryRunner.rollbackTransaction();

      this.logger.checkpoint(traceId, 'transaction-rolled-back', ctx);

      // Log and handle error
      this.logger.fail(ctx, error as Error, traceId, 'failed', {
        title: dto.title,
        slug: lockSlugKey,
      });

      // Use error handler to throw appropriate exception
      return this.errorHandler.handle(ctx, error, this.ENTITY_NAME);
    } finally {
      if (lockSlugId && lockSlugKey) {
        await this.redisService.releaseLock(lockSlugKey, lockSlugId);
        this.logger.debug(ctx, 'processing', 'Slug lock released', {
          traceId,
          lockKey: lockSlugKey,
        });
      }

      if (lockPositionId && lockPositionKey) {
        await this.redisService.releaseLock(lockPositionKey, lockPositionId);
        this.logger.debug(ctx, 'processing', 'Position lock released', {
          traceId,
          lockKey: lockPositionKey,
        });
      }

      await queryRunner.release();

      this.logger.checkpoint(traceId, 'resources-released', ctx);
    }
  }
}
