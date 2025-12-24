import { Body, Controller, Post } from '@nestjs/common';
import { AdminCreateCategoryService } from '../../application/admin/services/create-category.admin.service';
import { AdminCreateCategoryDto } from '../../application/admin/dtos/admin-create-category.admin.dto';

@Controller('admin/categories')
export class AdminCategoryController {
  constructor(
    private readonly createCategoryService: AdminCreateCategoryService,
  ) {}

  @Post()
  async createCategory(@Body() dto: AdminCreateCategoryDto) {
    return await this.createCategoryService.execute(dto);
  }
}
