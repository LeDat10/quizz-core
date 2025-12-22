// redis.module.ts
import { Module } from '@nestjs/common';
import { RedisClientProvider } from './redis.provider';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [RedisClientProvider],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
