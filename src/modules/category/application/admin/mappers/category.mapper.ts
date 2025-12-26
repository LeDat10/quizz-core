import { Category } from 'src/modules/category/domain/entities/category.entity';
import { AdminResponseCategoryDto } from '../dtos/admin-response-category.admin.dto';
import { Injectable } from '@nestjs/common';
import { AdminUpdateCategoryDto } from '../dtos/admin-update-category.admin.dto';
import { AdminCreateCategoryDto } from '../dtos/admin-create-category.admin.dto';

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

  fromCreateDto(dto: AdminCreateCategoryDto): Category {
    const category = new Category();

    // Required fields - assign directly
    category.title = dto.title;

    // Optional fields - check với hasOwnProperty hoặc in operator
    if ('description' in dto) {
      category.description = dto.description;
    }

    if ('thumbnail' in dto) {
      category.thumbnail = dto.thumbnail;
    }

    return category;
  }

  fromUpdateDto(category: Category, dto: AdminUpdateCategoryDto): Category {
    if (dto.title) {
      category.title = dto.title;
    }

    if ('description' in dto) {
      category.description = dto.description;
    }

    if (dto.position) {
      category.position = dto.position;
    }

    if (dto.status) {
      category.status = dto.status;
    }

    if ('thumbnail' in dto) {
      category.thumbnail = dto.thumbnail;
    }

    return category;
  }
}
