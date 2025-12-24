import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CategoryRepository } from '../../../domain/interfaces/category-repository.interface';
import { AdminCreateCategoryDto } from '../dtos/admin-create-category.admin.dto';
import {
  generateRadomString,
  generateSlug,
} from 'src/shared/common/utils/slug.until';
import { DataSource, QueryRunner } from 'typeorm';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';
import { Category } from '../../../domain/entities/category.entity';

@Injectable()
export class AdminCreateCategoryService {
  private logger = new Logger(AdminCreateCategoryService.name);
  private readonly MAX_SLUG_RETRIES = 5;
  private readonly LOCK_TTL = 5000;
  constructor(
    private readonly connection: DataSource,
    @Inject('CATEGORY_REPOSITORY')
    private readonly categoryRepo: CategoryRepository,
    private readonly redisService: RedisService,
  ) {}

  async execute(dto: AdminCreateCategoryDto): Promise<Category> {
    if (!dto) {
      const reason = 'CreateCategoryDto is null or undefined';
      this.logger.error(reason);
      throw new HttpException(reason, 400);
    }

    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let lockSlugId: string | null = null;
    let lockSlugKey: string | null = null;
    let lockMaxPositionId: string | null = null;
    let lockMaxPositionKey: string | null = null;

    try {
      const { slug, lockKey, lockId } = await this.generateUniqueSlug(
        dto.title,
        queryRunner,
      );

      lockSlugKey = lockKey;
      lockSlugId = lockId;

      lockMaxPositionKey = 'category:maxPosition';
      lockMaxPositionId = await this.redisService.acquireWithRetry(
        lockMaxPositionKey,
        this.LOCK_TTL,
        3,
        queryRunner,
      );

      if (!lockMaxPositionId) {
        throw new ConflictException(
          'Unable to acquire lock for max position. Please try again.',
        );
      }

      const maxPosition: number = await this.categoryRepo.maxPosition();

      const category: Category = queryRunner.manager.create(Category, {
        ...dto,
        slug,
        position: maxPosition + 1,
      });

      await queryRunner.manager.save(category);
      await queryRunner.commitTransaction();

      return category;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof HttpException) throw error;

      throw new HttpException(errorMessage, 500);
    } finally {
      if (lockSlugId && lockSlugKey)
        await this.redisService.releaseLock(lockSlugKey, lockSlugId);
      if (lockMaxPositionId && lockMaxPositionKey)
        await this.redisService.releaseLock(
          lockMaxPositionKey,
          lockMaxPositionId,
        );
      await queryRunner.release();
    }
  }

  private async generateUniqueSlug(
    title: string,
    queryRunner: QueryRunner,
  ): Promise<{
    slug: string;
    lockKey: string;
    lockId: string;
  }> {
    let slug = generateSlug(title);
    let attempt = 0;

    while (attempt < this.MAX_SLUG_RETRIES) {
      const lockKey = `category:slug:${slug}`;
      const lockId = await this.redisService.acquireWithRetry(
        lockKey,
        this.LOCK_TTL,
        3,
        queryRunner,
      );

      if (!lockId) {
        // Lock failed, try new slug
        slug = `${generateSlug(title)}-${generateRadomString(6)}`;
        attempt++;
        continue;
      }

      try {
        const exists = await this.categoryRepo.findBySlug(slug);

        if (!exists) {
          // Found unique slug, but don't release lock yet
          // Caller will use this lock
          return {
            slug,
            lockKey,
            lockId,
          };
        }

        // Slug exists, release lock and try new one
        await this.redisService.releaseLock(lockKey, lockId);
        slug = `${generateSlug(title)}-${generateRadomString(6)}`;
        attempt++;
      } catch (error) {
        await this.redisService.releaseLock(lockKey, lockId);
        throw error;
      }
    }

    throw new ConflictException(
      'Unable to generate unique slug after maximum retries',
    );
  }
}
