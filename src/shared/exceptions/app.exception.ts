import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(code: string, message: string, status: HttpStatus) {
    super(
      {
        statusCode: status,
        code,
        message,
      },
      status,
    );
  }
}
