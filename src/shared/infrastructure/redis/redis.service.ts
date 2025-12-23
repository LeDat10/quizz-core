import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';
import { DataSource, QueryRunner } from 'typeorm';
import { MetricsService } from './metrics.service';
@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private circuitBreaker: CircuitBreakerService;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    private readonly dataSource: DataSource,
    private readonly metricsService: MetricsService,
  ) {
    this.circuitBreaker = new CircuitBreakerService({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
    });
  }

  onModuleInit() {
    // Health check
    this.redisClient.on('connect', () => {
      this.logger.log('Redis connected');
      this.metricsService.recordRedisHealth('up');
    });

    this.redisClient.on('error', (error) => {
      this.logger.error('Redis error:', error.message);
      this.metricsService.recordRedisHealth('down');
    });

    // Periodic health check
    setInterval(() => void this.healthCheck(), 10000);
  }

  async acquireRedisLock(key: string, ttl: number = 10000) {
    const startTime = Date.now();
    const lockKey = `lock:${key}`;
    const lockId = uuidv4();

    try {
      const result = await this.circuitBreaker.excute(async () => {
        return await Promise.race([
          this.redisClient.set(lockKey, lockId, 'PX', ttl, 'NX'),
          this.timeout(3000, 'Lock acquire timeout'),
        ]);
      }, `acquire:${key}`);

      const duration = Date.now() - startTime;
      this.metricsService.recordLockAcquire({
        key,
        duration,
        success: result === 'OK',
      });

      if (result === 'OK') {
        this.logger.log(`Redis lock acquired: ${key} (${duration}ms)`);
        return lockId;
      }

      return null;
    } catch (error: unknown) {
      const errorMessage = this.getErrorMessage(error);
      const duration = Date.now() - startTime;

      this.logger.error(`Redis lock failed: ${key}`, {
        error: errorMessage,
        duration,
      });

      this.metricsService.recordLockAcquire({
        key,
        duration,
        success: false,
      });

      throw error;
    }
  }

  async acquireLock(
    key: string,
    ttl: number = 10000,
    queryRunner: QueryRunner,
  ): Promise<string | null> {
    try {
      return await this.acquireRedisLock(key, ttl);
    } catch (error: unknown) {
      console.log(error);
      const errorMessage = this.getErrorMessage(error);
      const circuitState = this.circuitBreaker.getState();

      if (circuitState === CircuitState.OPEN) {
        this.logger.warn(
          `Circuit breaker OPEN, using DB lock immediately for ${key}`,
        );
        return this.fallbackToDbLock(key, queryRunner);
      }

      // Check if should fallback
      if (this.shouldFallbackToDb(errorMessage)) {
        this.logger.warn(`Falling back to DB lock for ${key}`);
        return this.fallbackToDbLock(key, queryRunner);
      }

      throw error;
    }
  }

  private async fallbackToDbLock(
    key: string,
    queryRunner: QueryRunner,
  ): Promise<string> {
    const hash = this.hashString(key);
    try {
      await queryRunner.connect();
      await queryRunner.query('SELECT pg_advisory_lock($1)', [hash]);
      this.logger.log(`DB lock acquired: ${key}`);
      return `db-lock:${hash}`;
    } catch (error) {
      // Type-safe error handling
      const errorMessage = this.getErrorMessage(error);
      this.logger.error(`DB lock failed: ${key}`, errorMessage);
      throw new Error(`Failed to acquire DB lock: ${errorMessage}`);
    }
  }

  // Helper: Extract error message safely
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'Unknown error';
  }

  /**
   * Check if should fallback to DB
   */
  private shouldFallbackToDb(errorMessage: string): boolean {
    return (
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('Circuit breaker is OPEN')
    );
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    );
  }

  /**
   * Health check
   */
  private async healthCheck(): Promise<void> {
    try {
      await this.redisClient.ping();
      this.metricsService.recordRedisHealth('up');
    } catch (error: unknown) {
      console.log(error);
      this.metricsService.recordRedisHealth('down');
    }
  }

  /**
   * Release lock
   */
  async releaseLock(key: string, lockId: string): Promise<boolean> {
    const startTime = Date.now();
    const lockKey = `lock:${key}`;

    try {
      // Lua script: Chỉ delete nếu lockId khớp
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redisClient.eval(script, 1, lockKey, lockId);
      const duration = Date.now() - startTime;

      this.metricsService.recordLockRelease({
        key,
        duration,
        success: result === 1,
      });

      if (result === 1) {
        this.logger.log(`Lock released: ${key}`);
        return true;
      }

      this.logger.warn(`Lock already expired or not owned: ${key}`);
      return false;
    } catch (error) {
      // Type-safe error handling
      const errorMessage = this.getErrorMessage(error);
      const duration = Date.now() - startTime;

      this.logger.error(`Lock release failed: ${key}`, errorMessage);

      this.metricsService.recordLockRelease({
        key,
        duration,
        success: false,
      });

      // Don't throw - lock sẽ expire
      return false;
    }
  }

  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async acquireWithRetry(
    key: string,
    ttlMs: number = 3000,
    maxRetries: number = 3,
    queryRunner: QueryRunner,
  ): Promise<string | null> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const circuitState = this.circuitBreaker.getState();
        if (circuitState === CircuitState.OPEN) {
          this.logger.warn(
            `Circuit breaker OPEN (attempt ${i + 1}/${maxRetries}), skipping Redis`,
          );
          // Skip Redis, dùng DB luôn
          return await this.fallbackToDbLock(key, queryRunner);
        }

        //  Try acquire lock
        const lockId = await this.acquireLock(key, ttlMs, queryRunner);
        if (lockId) {
          this.logger.log(
            `Lock acquired on attempt ${i + 1}/${maxRetries}: ${key}`,
          );
          return lockId;
        }

        // Lock conflict (already taken)
        this.logger.debug(
          `Lock conflict on attempt ${i + 1}/${maxRetries}: ${key}`,
        );
      } catch (error: unknown) {
        const errorMessage = this.getErrorMessage(error);
        this.logger.warn(
          `Attempt ${i + 1}/${maxRetries} failed for ${key}: ${errorMessage}`,
        );

        if (
          errorMessage.includes('Circuit breaker is OPEN') &&
          i < maxRetries - 1
        ) {
          // Circuit đã OPEN, thử DB lock
          try {
            return await this.fallbackToDbLock(key, queryRunner);
          } catch (dbError: unknown) {
            this.logger.error(
              'DB fallback also failed:',
              this.getErrorMessage(dbError),
            );
            // Continue to next retry
          }
        }

        if (i < maxRetries - 1) {
          const delay = 50 * (i + 1);
          await this.sleep(delay);
        }
      }
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
