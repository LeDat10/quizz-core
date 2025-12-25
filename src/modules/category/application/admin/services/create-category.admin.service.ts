import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CategoryRepository } from '../../../domain/interfaces/category-repository.interface';
import { AdminCreateCategoryDto } from '../dtos/admin-create-category.admin.dto';
import {
  generateRadomString,
  generateSlug,
} from 'src/shared/common/utils/slug/slug.until';
import { DataSource, QueryRunner } from 'typeorm';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';
import { Category } from '../../../domain/entities/category.entity';
import { LoggerContext, LoggerHelper } from 'src/shared/common/logging';
import { ErrorHandlerHelper } from 'src/shared/common/errors';
import { AdminResponseCategoryDto } from '../dtos/admin-response-category.admin.dto';
import { CategoryMapper } from '../mappers/category.mapper';

@Injectable()
export class AdminCreateCategoryService {
  private readonly logger: LoggerHelper;
  private readonly errorHandler: ErrorHandlerHelper;
  private readonly MAX_SLUG_RETRIES = 5;
  private readonly LOCK_TTL = 5000;
  private readonly ENTITY_NAME = 'Category';

  constructor(
    private readonly connection: DataSource,
    @Inject('CATEGORY_REPOSITORY')
    private readonly categoryRepo: CategoryRepository,
    private readonly redisService: RedisService,
    private readonly categoryMapper: CategoryMapper,
  ) {
    this.logger = new LoggerHelper(AdminCreateCategoryService.name);
    this.errorHandler = new ErrorHandlerHelper(AdminCreateCategoryService.name);
  }

  async execute(
    dto: AdminCreateCategoryDto,
  ): Promise<AdminResponseCategoryDto | undefined> {
    const ctx: LoggerContext = {
      method: 'execute',
      entity: 'Category',
    };

    const traceId = this.logger.start(ctx, {
      operation: 'createCategory',
      title: dto.title,
    });

    try {
      if (!dto) {
        const reason = 'CreateCategoryDto is null or undefined';
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
    let lockMaxPositionId: string | null = null;
    let lockMaxPositionKey: string | null = null;

    try {
      // Generate unique slug
      this.logger.checkpoint(traceId, 'generating-slug', ctx, {
        title: dto.title,
      });

      const { slug, lockKey, lockId } = await this.generateUniqueSlug(
        dto.title,
        queryRunner,
        ctx,
        traceId,
      );

      lockSlugKey = lockKey;
      lockSlugId = lockId;

      this.logger.checkpoint(traceId, 'slug-generated', ctx, {
        slug,
      });

      // Acquire max position lock
      this.logger.info(ctx, 'processing', 'Acquiring max position lock', {
        traceId,
      });

      lockMaxPositionKey = 'category:maxPosition';
      lockMaxPositionId = await this.redisService.acquireWithRetry(
        lockMaxPositionKey,
        this.LOCK_TTL,
        3,
        queryRunner,
      );

      if (!lockMaxPositionId) {
        this.logger.warn(ctx, 'failed', 'Failed to acquire max position lock', {
          traceId,
          attempts: 3,
        });

        throw new ConflictException(
          'Unable to acquire lock for max position. Please try again.',
        );
      }

      this.logger.checkpoint(traceId, 'position-lock-acquired', ctx);

      const maxPosition: number = await this.categoryRepo.maxPosition();

      this.logger.checkpoint(traceId, 'max-position-retrieved', ctx, {
        maxPosition,
        newPosition: maxPosition + 1,
      });

      const category: Category = queryRunner.manager.create(Category, {
        ...dto,
        slug,
        position: maxPosition + 1,
      });

      this.logger.checkpoint(traceId, 'category-entity-created', ctx);

      await queryRunner.manager.save(category);

      this.logger.checkpoint(traceId, 'category-saved', ctx, {
        categoryId: category.id,
      });

      await queryRunner.commitTransaction();

      this.logger.checkpoint(traceId, 'transaction-committed', ctx);

      // Log success
      this.logger.success(
        {
          ...ctx,
          id: category.id,
        },
        traceId,
        'created',
        {
          ...category,
        },
      );

      return this.categoryMapper.toAdminResponseDto(category);
    } catch (error: unknown) {
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
      this.errorHandler.handle(ctx, error, this.ENTITY_NAME);
    } finally {
      if (lockSlugId && lockSlugKey) {
        await this.redisService.releaseLock(lockSlugKey, lockSlugId);
        this.logger.debug(ctx, 'processing', 'Slug lock released', {
          traceId,
          lockKey: lockSlugKey,
        });
      }

      if (lockMaxPositionId && lockMaxPositionKey) {
        await this.redisService.releaseLock(
          lockMaxPositionKey,
          lockMaxPositionId,
        );
        this.logger.debug(ctx, 'processing', 'Max position lock released', {
          traceId,
          lockKey: lockMaxPositionKey,
        });
      }

      // Release query runner
      await queryRunner.release();

      this.logger.checkpoint(traceId, 'resources-released', ctx);
    }
  }

  private async generateUniqueSlug(
    title: string,
    queryRunner: QueryRunner,
    ctx: LoggerContext,
    traceId: string,
  ): Promise<{
    slug: string;
    lockKey: string;
    lockId: string;
  }> {
    let slug = generateSlug(title);
    let attempt = 0;

    this.logger.debug(ctx, 'processing', 'Starting slug generation', {
      traceId,
      baseSlug: slug,
      maxRetries: this.MAX_SLUG_RETRIES,
    });

    while (attempt < this.MAX_SLUG_RETRIES) {
      const lockKey = `category:slug:${slug}`;

      this.logger.verbose(ctx, 'processing', `Attempting slug: ${slug}`, {
        traceId,
        attempt: attempt + 1,
        lockKey,
      });

      const lockId = await this.redisService.acquireWithRetry(
        lockKey,
        this.LOCK_TTL,
        3,
        queryRunner,
      );

      if (!lockId) {
        // Lock failed, try new slug
        this.logger.debug(ctx, 'warning', 'Lock acquisition failed', {
          traceId,
          attempt: attempt + 1,
          slug,
        });

        slug = `${generateSlug(title)}-${generateRadomString(6)}`;
        attempt++;
        continue;
      }

      try {
        const exists = await this.categoryRepo.findBySlug(slug);

        if (!exists) {
          // Found unique slug
          this.logger.info(ctx, 'success', 'Unique slug generated', {
            traceId,
            slug,
            attempts: attempt + 1,
          });

          return {
            slug,
            lockKey,
            lockId,
          };
        }

        // Slug exists, release lock and try new one
        this.logger.debug(ctx, 'warning', 'Slug already exists', {
          traceId,
          attempt: attempt + 1,
          slug,
        });

        await this.redisService.releaseLock(lockKey, lockId);
        slug = `${generateSlug(title)}-${generateRadomString(6)}`;
        attempt++;
      } catch (error: unknown) {
        this.logger.error(ctx, error as Error, 'failed', {
          traceId,
          operation: 'checkSlugExistence',
          slug,
          attempt: attempt + 1,
        });

        await this.redisService.releaseLock(lockKey, lockId);
        throw error;
      }
    }

    // Max retries reached
    this.logger.error(ctx, 'Max slug generation retries reached', 'failed', {
      traceId,
      title,
      maxRetries: this.MAX_SLUG_RETRIES,
      lastAttemptedSlug: slug,
    });

    throw new ConflictException(
      'Unable to generate unique slug after maximum retries',
    );
  }
}
