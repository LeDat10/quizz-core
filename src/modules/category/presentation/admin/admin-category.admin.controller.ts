import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminCreateCategoryService } from '../../application/admin/services/create-category.admin.service';
import { AdminCreateCategoryDto } from '../../application/admin/dtos/admin-create-category.admin.dto';
import { UpdateCategoryAdminService } from '../../application/admin/services/update-category.admin.service';

@Controller('admin/categories')
export class AdminCategoryController {
  constructor(
    private readonly createCategoryService: AdminCreateCategoryService,
    private readonly updateCategoryService: UpdateCategoryAdminService,
  ) {}

  @Post()
  async createCategory(@Body() dto: AdminCreateCategoryDto) {
    return await this.createCategoryService.execute(dto);
  }

  @Patch(':id')
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCreateCategoryDto,
  ) {
    return await this.updateCategoryService.excute(id, dto);
  }
}
