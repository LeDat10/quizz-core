import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CategoryRepository } from '../../domain/interfaces/category-repository.interface';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import {
  generateRadomString,
  generateSlug,
} from 'src/shared/common/utils/slug.until';
import { DataSource } from 'typeorm';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';
import { Category } from '../../domain/entities/category.entity';

@Injectable()
export class CreateCategoryService {
  private logger = new Logger(CreateCategoryService.name);
  constructor(
    private readonly connection: DataSource,
    private readonly categoryRepo: CategoryRepository,
    private readonly redisService: RedisService,
  ) {}

  async excute(dto: CreateCategoryDto) {
    try {
      if (!dto) {
        const reason = 'CreateCategoryDto is null or undefined';
        this.logger.error(reason);
        throw new Error(reason);
      }
    } catch (error: unknown) {
      // Type guard to safely access the error message
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // If it's already a NestJS exception (like ConflictException), rethrow it
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(errorMessage, 500);
    }

    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let lockSlugId: string | null = null;
    let lockMaxPositionId: string | null = null;
    let lockSlugKey: string | null = null;
    let lockMaxPositionKey: string | null = null;

    try {
      let slug = generateSlug(dto.title);
      const existingCategory = await this.categoryRepo.findBySlug(slug);
      if (existingCategory) {
        const reason = `Category with slug '${slug}' already exists`;
        this.logger.warn(reason);
        slug = `${slug}-${generateRadomString(6)}`;
      }
      lockSlugKey = `category:slug:${slug}`;
      lockSlugId = await this.redisService.acquireWithRetry(
        lockSlugKey,
        5000,
        3,
        queryRunner,
      );

      if (!lockSlugId) {
        throw new ConflictException(
          'Unable to create category. Please try again.',
        );
      }

      const maxPosition: number = await this.categoryRepo.maxPosition();
      lockMaxPositionKey = `category:maxPosition`;
      lockMaxPositionId = await this.redisService.acquireWithRetry(
        lockMaxPositionKey,
        5000,
        3,
        queryRunner,
      );

      if (!lockMaxPositionId) {
        throw new ConflictException(
          'Unable to create category. Please try again.',
        );
      }

      const category: Category = queryRunner.manager.create(Category, {
        ...dto,
        slug: slug,
        position: maxPosition + 1,
      });

      await queryRunner.manager.save(category);

      await queryRunner.commitTransaction();
      return category;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();

      // Type guard to safely access the error message
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // If it's already a NestJS exception (like ConflictException), rethrow it
      if (error instanceof HttpException) {
        throw error;
      }

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
}
