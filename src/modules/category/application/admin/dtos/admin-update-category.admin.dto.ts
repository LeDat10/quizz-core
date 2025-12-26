import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Status } from 'src/shared/common/status';

export class AdminUpdateCategoryDto {
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  title?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  thumbnail?: string;

  @IsEnum(Status)
  @ApiPropertyOptional()
  @IsOptional()
  status?: Status;

  @IsInt()
  @IsOptional()
  @ApiPropertyOptional()
  position?: number;
}
