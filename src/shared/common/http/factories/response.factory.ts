import { ResponseMeta, ErrorDetail } from '../interfaces';
import {
  BaseResponseDto,
  ErrorResponseDto,
  PaginationResponse,
} from '../dtos/responses';
import { PaginationOptions } from '../types/pagination.types';
import { PaginationBuilder } from './pagination.builder';

export class ResponseFactory {
  /**
   * Create success response
   */
  static success<T>(
    data?: T,
    message = 'Operation completed successfully',
    meta?: Partial<ResponseMeta>,
  ): BaseResponseDto<T> {
    return new BaseResponseDto({
      success: true,
      statusCode: 200,
      message,
      data,
      meta: meta ? this.buildMeta(meta) : undefined,
    });
  }

  /**
   * Create success response with custom status code
   */
  static successWithStatus<T>(
    statusCode: number,
    data?: T,
    message = 'Success',
    meta?: Partial<ResponseMeta>,
  ): BaseResponseDto<T> {
    return new BaseResponseDto({
      success: true,
      statusCode,
      message,
      data,
      meta: meta ? this.buildMeta(meta) : undefined,
    });
  }

  /**
   * Create 201 Created response
   */
  static created<T>(
    data: T,
    message = 'Resource created successfully',
    meta?: Partial<ResponseMeta>,
  ): BaseResponseDto<T> {
    return this.successWithStatus(201, data, message, meta);
  }

  /**
   * Create 204 No Content response
   */
  static noContent(
    message = 'Operation completed successfully',
  ): BaseResponseDto<null> {
    return new BaseResponseDto({
      success: true,
      statusCode: 204,
      message,
      data: null,
    });
  }

  /**
   * Create paginated response with HATEOAS links
   */
  static paginated<T>(
    data: T[],
    options: PaginationOptions,
  ): PaginationResponse<T> {
    return PaginationBuilder.build(data, options);
  }

  /**
   * Create error response
   */
  static error(
    statusCode: number,
    message: string,
    errorCode?: string,
    errors?: ErrorDetail[],
    meta?: Partial<ResponseMeta>,
  ): ErrorResponseDto {
    return new ErrorResponseDto({
      success: false,
      statusCode,
      message,
      errorCode,
      errors,
      meta: meta ? this.buildMeta(meta) : undefined,
    });
  }

  /**
   * Create 400 Bad Request
   */
  static badRequest(
    message = 'Bad request',
    errors?: ErrorDetail[],
  ): ErrorResponseDto {
    return this.error(400, message, 'BAD_REQUEST', errors);
  }

  /**
   * Create 401 Unauthorized
   */
  static unauthorized(message = 'Unauthorized access'): ErrorResponseDto {
    return this.error(401, message, 'UNAUTHORIZED');
  }

  /**
   * Create 403 Forbidden
   */
  static forbidden(message = 'Access forbidden'): ErrorResponseDto {
    return this.error(403, message, 'FORBIDDEN');
  }

  /**
   * Create 404 Not Found
   */
  static notFound(
    message = 'Resource not found',
    resource?: string,
  ): ErrorResponseDto {
    return this.error(
      404,
      resource ? `${resource} not found` : message,
      'NOT_FOUND',
    );
  }

  /**
   * Create 409 Conflict
   */
  static conflict(
    message = 'Resource conflict',
    errors?: ErrorDetail[],
  ): ErrorResponseDto {
    return this.error(409, message, 'CONFLICT', errors);
  }

  /**
   * Create 422 Unprocessable Entity (Validation Error)
   */
  static validationError(
    errors: ErrorDetail[],
    message = 'Validation failed',
  ): ErrorResponseDto {
    return this.error(422, message, 'VALIDATION_ERROR', errors);
  }

  /**
   * Create 500 Internal Server Error
   */
  static internalError(
    message = 'Internal server error',
    stack?: string,
  ): ErrorResponseDto {
    const response = this.error(500, message, 'INTERNAL_ERROR');

    if (process.env.NODE_ENV === 'development' && stack) {
      response.stack = stack;
    }

    return response;
  }

  /**
   * Helper: Build metadata with defaults
   */
  private static buildMeta(meta: Partial<ResponseMeta>): ResponseMeta {
    return {
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || '1.0.0',
      ...meta,
    };
  }
}
