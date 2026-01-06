import { HttpStatus } from '@nestjs/common';
import { AppException } from 'src/shared/exceptions/app.exception';
import { ErrorCode } from 'src/shared/exceptions/enums/error-code.enum';

export class CategoryNotFoundException extends AppException {
  constructor(id: string) {
    super(
      ErrorCode.CATEGORY_NOT_FOUND,
      `Category with id ${id} was not found`,
      HttpStatus.NOT_FOUND,
    );
  }
}
