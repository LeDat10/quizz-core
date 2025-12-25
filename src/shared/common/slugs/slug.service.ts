import { ConflictException, Injectable } from '@nestjs/common';
import { LoggerContext, LoggerHelper } from '../logging';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';
import { QueryRunner } from 'typeorm';
import { generateRadomString, generateSlug } from '../utils/slug/slug.until';
import { SlugExistenceChecker, SlugGenerationOptions } from './slug.interface';

@Injectable()
export class SlugService {
  private logger: LoggerHelper;

  private readonly DEFAULT_MAX_RETRIES = 10;
  private readonly DEFAULT_LOCK_TTL = 5000;
  private readonly DEFAULT_LOCK_RETRIES = 3;
  private readonly DEFAULT_RANDOM_LENGTH = 6;

  constructor(private readonly redisService: RedisService) {
    this.logger = new LoggerHelper(SlugService.name);
  }

  async generateUniqueSlug(
    title: string,
    queryRunner: QueryRunner,
    ctx: LoggerContext,
    traceId: string,
    existenceChecker: SlugExistenceChecker,
    options: SlugGenerationOptions = {},
  ) {
    const {
      maxRetries = this.DEFAULT_MAX_RETRIES,
      lockTTL = this.DEFAULT_LOCK_TTL,
      lockRetries = this.DEFAULT_LOCK_RETRIES,
      prefix = 'slug',
      randomLength = this.DEFAULT_RANDOM_LENGTH,
    } = options;

    let slug = generateSlug(title);
    let attempt = 0;

    this.logger.debug(ctx, 'processing', 'Starting slug generation', {
      traceId,
      baseSlug: slug,
      maxRetries,
      prefix,
    });

    while (attempt < maxRetries) {
      const lockKey = `${prefix}:slug:${slug}`;

      this.logger.verbose(ctx, 'processing', `Attempting slug: ${slug}`, {
        traceId,
        attempt: attempt + 1,
        lockKey,
      });

      // 1. Acquire distributed lock
      const lockId = await this.redisService.acquireWithRetry(
        lockKey,
        lockTTL,
        lockRetries,
        queryRunner,
      );

      if (!lockId) {
        // Lock failed, generate new slug immediately
        this.logger.debug(ctx, 'warning', 'Lock acquisition failed', {
          traceId,
          attempt: attempt + 1,
          slug,
        });

        slug = this.generateRandomizedSlug(title, randomLength);
        attempt++;
        continue;
      }

      // 2. Check existence with lock held
      try {
        const exists = await existenceChecker(slug);

        if (!exists) {
          // Found unique slug - keep lock and return
          this.logger.info(ctx, 'success', 'Unique slug generated', {
            traceId,
            slug,
            attempts: attempt + 1,
          });

          return {
            slug,
            lockKey,
            lockId,
            attempts: attempt + 1,
          };
        }

        // Slug exists, release lock and try new one
        this.logger.debug(ctx, 'warning', 'Slug already exists', {
          traceId,
          attempt: attempt + 1,
          slug,
        });

        await this.redisService.releaseLock(lockKey, lockId);
        slug = this.generateRandomizedSlug(title, randomLength);
        attempt++;
      } catch (error: unknown) {
        this.logger.error(ctx, error as Error, 'failed', {
          traceId,
          operation: 'checkSlugExistence',
          slug,
          attempt: attempt + 1,
        });

        // Release lock on error
        await this.redisService.releaseLock(lockKey, lockId);
        throw error;
      }
    }
    // Max retries reached
    this.logger.error(ctx, 'Max slug generation retries reached', 'failed', {
      traceId,
      title,
      maxRetries,
      lastAttemptedSlug: slug,
    });

    throw new ConflictException(
      'Unable to generate unique slug after maximum retries',
    );
  }

  /**
   * Generate slug with random suffix
   */
  private generateRandomizedSlug(title: string, randomLength: number): string {
    const baseSlug = generateSlug(title);
    const randomSuffix = generateRadomString(randomLength);
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Release lock sau khi hoàn thành transaction
   * Nên gọi trong finally block hoặc commit/rollback handler
   */
  async releaseLock(lockKey: string, lockId: string): Promise<void> {
    const ctx = { method: 'releaseLock', entity: '' };
    try {
      await this.redisService.releaseLock(lockKey, lockId);
    } catch (error: unknown) {
      this.logger.warn(ctx, 'warning', 'Failed to release slug lock', {
        lockKey,
        lockId,
        error,
      });
    }
  }
}
