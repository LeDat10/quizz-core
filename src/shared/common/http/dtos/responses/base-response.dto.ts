import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResponseMeta } from '../../interfaces';
import { ErrorDetail } from '../../interfaces';

export class BaseResponseDto<T = any> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'HTTP status code',
    example: 200,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Response message',
    example: 'Operation completed successfully',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Response data',
  })
  data?: T;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    type: 'object',
    additionalProperties: true,
  })
  meta?: ResponseMeta;

  @ApiPropertyOptional({
    description: 'Error details (only for error responses)',
    type: 'array',
  })
  errors?: ErrorDetail[];

  constructor(partial: Partial<BaseResponseDto<T>>) {
    Object.assign(this, partial);
    this.success = partial.success ?? true;
    this.statusCode = partial.statusCode ?? 200;
    this.message = partial.message ?? 'Success';

    if (this.meta) {
      this.meta.timestamp = this.meta.timestamp ?? new Date().toISOString();
    }
  }
}
