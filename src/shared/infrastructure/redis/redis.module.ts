// redis.module.ts
import { Module } from '@nestjs/common';
import { RedisClientProvider } from './redis.provider';
import { ConfigModule } from '@nestjs/config';
import { MetricsService } from './metrics.service';
import { RedisService } from './redis.service';

@Module({
  imports: [ConfigModule],
  providers: [RedisClientProvider, MetricsService, RedisService],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
