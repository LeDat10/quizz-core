import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import databaseConfig from './shared/config/database.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Module } from './shared/infrastructure/aws/s3.module';
import { PemService } from './shared/infrastructure/aws/pem.service';
import { Category } from './modules/category/domain/entities/category.entity';

const ENV = process.env.NODE_ENV;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: !ENV ? '.env' : `.env.${ENV.trim()}`,
      load: [databaseConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, S3Module],
      inject: [ConfigService, PemService],
      useFactory: async (
        configService: ConfigService,
        pemService: PemService,
      ) => {
        const sslEnabled = configService.get<string>('database.ssl') === 'true';
        const pem = sslEnabled
          ? await pemService.getPem(
              configService.get<string>('database.bucket') || '',
              configService.get<string>('database.key') || '',
            )
          : undefined;
        return {
          type: 'postgres',
          ssl: sslEnabled ? { ca: pem } : false,
          synchronize: configService.get<boolean>('database.synchronize'),
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          entities: [Category],
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
