import { Category } from 'src/modules/category/domain/entities/category.entity';
import { AdminResponseCategoryDto } from '../dtos/admin-response-category.admin.dto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CategoryMapper {
  toAdminResponseDto(category: Category): AdminResponseCategoryDto {
    return {
      id: category.id,
      title: category.title,
      description: category.description,
      status: category.status,
      position: category.position,
      slug: category.slug,
      thumbnail: category.thumbnail,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt || null,
      deletedAt: category.deletedAt || null,
    };
  }
}
