import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('redis.redisHost'),
          port: configService.get<number>('redis.redisPort'),
          password:
            configService.get<string>('redis.redisPassword') || undefined,
          db: configService.get<number>('redis.redisDB') || 0,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueInfrastructureModule {}
