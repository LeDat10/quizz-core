import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './domain/entities/category.entity';
import { AdminCreateCategoryService } from './application/admin/services/create-category.admin.service';
import { AdminCategoryController } from './presentation/admin/admin-category.admin.controller';
import { RedisModule } from 'src/shared/infrastructure/redis/redis.module';
import { CategoryTypeOrmRepository } from './infrastructure/repositories/category-typeorm.repository';
import { CategoryMapper } from './application/admin/mappers/category.mapper';
import { SlugService } from 'src/shared/common/slugs/slug.service';
import { UpdateCategoryAdminService } from './application/admin/services/update-category.admin.service';
import { StatusValidationService } from 'src/shared/common/status/services/status-validation.service';
import { StatusCascadeModule } from 'src/shared/infrastructure/queues/status-cascade.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category]),
    RedisModule,
    StatusCascadeModule,
  ],
  providers: [
    AdminCreateCategoryService,
    UpdateCategoryAdminService,
    StatusValidationService,
    {
      provide: 'CATEGORY_REPOSITORY',
      useClass: CategoryTypeOrmRepository,
    },
    CategoryMapper,
    SlugService,
  ],
  controllers: [AdminCategoryController],
})
export class CategoryModule {}
