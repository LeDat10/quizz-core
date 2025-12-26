import { ApiProperty } from '@nestjs/swagger';
import { BaseResponseDto } from './base-response.dto';

export class ErrorResponseDto extends BaseResponseDto<null> {
  @ApiProperty({
    description: 'Error code for client handling',
    example: 'VALIDATION_ERROR',
  })
  errorCode?: string;

  @ApiProperty({
    description: 'Stack trace (only in development)',
    required: false,
  })
  stack?: string;

  constructor(partial: Partial<ErrorResponseDto>) {
    super({
      ...partial,
      success: false,
      data: null,
    });
    this.errorCode = partial.errorCode;
    this.stack = partial.stack;
  }
}
