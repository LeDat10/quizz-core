import { HttpStatus } from '@nestjs/common';
import { AppException } from 'src/shared/exceptions/app.exception';
import { ErrorCode } from 'src/shared/exceptions/enums/error-code.enum';

export class CategoryPositionNotFoundException extends AppException {
  constructor(position: number) {
    super(
      ErrorCode.CATEGORY_POSITION_NOT_FOUND,
      `No category found at position ${position}.`,
      HttpStatus.NOT_FOUND,
    );
  }
}
