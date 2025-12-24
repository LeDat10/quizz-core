import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './domain/entities/category.entity';
import { AdminCreateCategoryService } from './application/admin/services/create-category.admin.service';
import { AdminCategoryController } from './presentation/admin/admin-category.admin.controller';
import { RedisModule } from 'src/shared/infrastructure/redis/redis.module';
import { CategoryTypeOrmRepository } from './infrastructure/repositories/category-typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Category]), RedisModule],
  providers: [
    AdminCreateCategoryService,
    {
      provide: 'CATEGORY_REPOSITORY',
      useClass: CategoryTypeOrmRepository,
    },
  ],
  controllers: [AdminCategoryController],
})
export class CategoryModule {}
