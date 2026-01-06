import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty } from 'class-validator';

export class ChangeCategoryPositionAdminDto {
  @IsInt()
  @IsNotEmpty()
  @ApiProperty()
  newPosition: number;
}
