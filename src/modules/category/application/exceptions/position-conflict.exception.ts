import { HttpStatus } from '@nestjs/common';
import { AppException } from 'src/shared/exceptions/app.exception';
import { ErrorCode } from 'src/shared/exceptions/enums/error-code.enum';

export class CategoryPositionConflictException extends AppException {
  constructor(position: number) {
    super(
      ErrorCode.CATEGORY_POSITION_CONFLICT,
      `Position ${position} is currently being updated by another process.`,
      HttpStatus.CONFLICT,
    );
  }
}
