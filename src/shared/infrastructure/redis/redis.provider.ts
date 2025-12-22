// redis.provider.ts
import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export const RedisClientProvider: Provider = {
  provide: 'REDIS_CLIENT',
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    return new Redis({
      host: configService.get<string>('redis.redisHost'),
      port: configService.get<number>('redis.redisPort'),
      password: configService.get<string>('redis.redisPassword') || undefined,
      db: configService.get<number>('redis.redisDB') || 0,
    });
  },
};
