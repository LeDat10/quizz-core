import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-ioredis';
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('redis.redisHost'),
        port: configService.get<number>('redis.redisPort'),
        ttl: configService.get<number>('redis.ttl') || 60,
        password: configService.get<string>('redis.redisPassword'),
        db: configService.get<number>('redis.redisDB') || 0,
      }),
    }),
  ],
})
export class RedisModule {}
