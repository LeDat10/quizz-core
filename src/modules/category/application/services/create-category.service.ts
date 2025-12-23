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

  async execute(dto: CreateCategoryDto) {
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
      let slug = generateSlug(dto.title);

      // Vòng lặp tạo slug với lock để tránh race condition
      while (true) {
        lockSlugKey = `category:slug:${slug}`;
        lockSlugId = await this.redisService.acquireWithRetry(
          lockSlugKey,
          5000,
          3,
          queryRunner,
        );

        if (!lockSlugId) {
          throw new ConflictException(
            'Unable to acquire lock for slug. Please try again.',
          );
        }

        const existingCategory = await this.categoryRepo.findBySlug(slug);

        if (!existingCategory) {
          break; // slug chưa tồn tại → OK
        }

        // slug đã tồn tại → release lock và generate slug mới
        await this.redisService.releaseLock(lockSlugKey, lockSlugId);
        slug = `${generateSlug(dto.title)}-${generateRadomString(6)}`;
        lockSlugId = null;
        lockSlugKey = null;
      }

      // Lock max position để tránh race condition khi tính position
      lockMaxPositionKey = 'category:maxPosition';
      lockMaxPositionId = await this.redisService.acquireWithRetry(
        lockMaxPositionKey,
        5000,
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
}
