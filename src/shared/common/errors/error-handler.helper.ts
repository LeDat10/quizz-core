import {
  HttpException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
  RequestTimeoutException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { LoggerContext, LoggerHelper } from '../logging';
import { Action, generateAdvancedMessage, MessageOptions } from '../messaging';
import { ErrorContext } from './error-context.interface';

interface ErrorLike {
  code?: string;
  message?: string | string[];
  name?: string;
  status?: number;
  response?: {
    message?: string | string[];
  };
}

export class ErrorHandlerHelper {
  private readonly logger: LoggerHelper;
  private readonly isDevelopment = process.env.NODE_ENV === 'development';

  constructor(private readonly contextName: string) {
    this.logger = new LoggerHelper(contextName, {
      enablePerformanceTracking: true,
      enableStructuredLogging: process.env.NODE_ENV === 'production',
    });
  }

  /**
   * Main error handler với advanced message generation
   */
  handle(
    ctx: LoggerContext,
    error: any,
    entity: string,
    id?: number | string,
  ): never {
    const baseContext = {
      ...ctx,
      entity,
      id,
    };

    // 1. TypeORM Errors
    if (error instanceof QueryFailedError) {
      this.handleQueryError(baseContext, error);
    }

    // 2. TypeORM Entity Not Found
    if (error instanceof EntityNotFoundError) {
      this.handleEntityNotFoundError(baseContext);
    }

    // 3. Connection / Network Errors
    if (this.isDatabaseConnectionError(error)) {
      this.handleConnectionError(baseContext, error);
    }

    // 4. Timeout Errors
    if (this.isTimeoutError(error)) {
      this.handleTimeoutError(baseContext, error);
    }

    // 5. Validation Errors
    if (this.isValidationError(error)) {
      this.handleValidationError(baseContext, error);
    }

    // 6. HttpException (NestJS exceptions)
    if (error instanceof HttpException) {
      this.handleHttpException(baseContext, error);
    }

    // 7. Unknown Errors
    this.handleUnknownError(baseContext, error);
  }

  /**
   * Handle TypeORM Query Errors
   */
  private handleQueryError(ctx: ErrorContext, error: QueryFailedError): never {
    const message = error.message?.toLowerCase() || '';
    const driverError = error.driverError;
    const constraint =
      (
        driverError as {
          constraint?: string;
        }
      )?.constraint || '';

    // Duplicate/Unique constraint violation
    if (message.includes('duplicate') || message.includes('unique')) {
      const field = this.extractFieldFromError(message, constraint);

      const messageOptions: MessageOptions = {
        action: 'failed',
        entity: ctx.entity!,
        id: ctx.id,
        reason: this.isDevelopment
          ? `Duplicate value for ${field || 'unique field'}`
          : `${ctx.entity} already exists`,
        status: 'error',
        metadata: this.isDevelopment
          ? {
              constraint,
              field,
              errorCode: 'DUPLICATE_ENTRY',
            }
          : undefined,
      };

      const errorMessage = generateAdvancedMessage(messageOptions);

      this.logger.error(ctx as LoggerContext, error, 'failed', {
        errorType: 'DuplicateEntry',
        field,
        constraint,
        traceId: ctx.traceId,
      });

      throw new ConflictException({
        message: errorMessage,
        errorCode: 'DUPLICATE_ENTRY',
        field,
        ...(this.isDevelopment && { details: message }),
      });
    }

    // Foreign key constraint violation
    if (
      message.includes('foreign key') ||
      message.includes('violates foreign key') ||
      constraint.includes('fk_')
    ) {
      const relatedEntity = this.extractRelatedEntity(message, constraint);

      const messageOptions: MessageOptions = {
        action: 'failed',
        entity: ctx.entity!,
        id: ctx.id,
        reason: this.isDevelopment
          ? `Cannot perform operation due to relationship with ${relatedEntity || 'related entity'}`
          : 'Cannot perform operation due to data dependencies',
        status: 'error',
        metadata: this.isDevelopment
          ? {
              relatedEntity,
              constraint,
              errorCode: 'FOREIGN_KEY_VIOLATION',
            }
          : undefined,
      };

      const errorMessage = generateAdvancedMessage(messageOptions);

      this.logger.error(ctx as LoggerContext, error, 'failed', {
        errorType: 'ForeignKeyViolation',
        relatedEntity,
        constraint,
        traceId: ctx.traceId,
      });

      throw new BadRequestException({
        message: errorMessage,
        errorCode: 'FOREIGN_KEY_VIOLATION',
        relatedEntity,
        ...(this.isDevelopment && { details: message }),
      });
    }

    // Not-null constraint violation
    if (message.includes('not-null') || message.includes('null value')) {
      const field = this.extractFieldFromError(message, constraint);

      const messageOptions: MessageOptions = {
        action: 'failed',
        entity: ctx.entity!,
        id: ctx.id,
        reason: this.isDevelopment
          ? `Field '${field || 'required field'}' cannot be null`
          : 'Missing required fields',
        status: 'error',
        metadata: this.isDevelopment
          ? {
              field,
              errorCode: 'NULL_CONSTRAINT_VIOLATION',
            }
          : undefined,
      };

      const errorMessage = generateAdvancedMessage(messageOptions);

      this.logger.error(ctx as LoggerContext, error, 'failed', {
        errorType: 'NullConstraintViolation',
        field,
        traceId: ctx.traceId,
      });

      throw new BadRequestException({
        message: errorMessage,
        errorCode: 'NULL_CONSTRAINT_VIOLATION',
        field,
        ...(this.isDevelopment && { details: message }),
      });
    }

    // Check constraint violation
    if (message.includes('check constraint')) {
      const messageOptions: MessageOptions = {
        action: 'failed',
        entity: ctx.entity!,
        id: ctx.id,
        reason: this.isDevelopment
          ? 'Data validation constraint failed'
          : 'Invalid data provided',
        status: 'error',
        metadata: this.isDevelopment
          ? {
              constraint,
              errorCode: 'CHECK_CONSTRAINT_VIOLATION',
            }
          : undefined,
      };

      const errorMessage = generateAdvancedMessage(messageOptions);

      this.logger.error(ctx as LoggerContext, error, 'failed', {
        errorType: 'CheckConstraintViolation',
        constraint,
        traceId: ctx.traceId,
      });

      throw new UnprocessableEntityException({
        message: errorMessage,
        errorCode: 'CHECK_CONSTRAINT_VIOLATION',
        ...(this.isDevelopment && { details: message }),
      });
    }

    // Generic query error
    const messageOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity!,
      id: ctx.id,
      reason: this.isDevelopment ? 'Database query failed' : 'Operation failed',
      status: 'error',
      metadata: this.isDevelopment
        ? {
            errorCode: 'QUERY_ERROR',
          }
        : undefined,
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.error(ctx as LoggerContext, error, 'failed', {
      errorType: 'QueryError',
      traceId: ctx.traceId,
    });

    throw new InternalServerErrorException({
      message: errorMessage,
      errorCode: 'QUERY_ERROR',
      ...(this.isDevelopment && { details: message }),
    });
  }

  /**
   * Handle Entity Not Found Error
   */
  private handleEntityNotFoundError(ctx: ErrorContext): never {
    const messageOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity!,
      id: ctx.id,
      reason: 'Resource not found',
      status: 'error',
      metadata: {
        errorCode: 'ENTITY_NOT_FOUND',
      },
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.warn(ctx as LoggerContext, 'failed', 'Entity not found', {
      errorType: 'EntityNotFound',
      traceId: ctx.traceId,
    });

    throw new NotFoundException({
      message: errorMessage,
      errorCode: 'ENTITY_NOT_FOUND',
      entity: ctx.entity,
      id: ctx.id,
    });
  }

  /**
   * Handle Connection Errors
   */
  private handleConnectionError(ctx: ErrorContext, error: any): never {
    const err = error as ErrorLike;
    const messageOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity!,
      id: ctx.id,
      reason: this.isDevelopment
        ? `Cannot connect to database or service (${err.code})`
        : 'Service temporarily unavailable',
      status: 'error',
      metadata: {
        errorCode: 'CONNECTION_ERROR',
        code: err.code,
      },
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.error(ctx as LoggerContext, error, 'failed', {
      errorType: 'ConnectionError',
      errorCode: err.code,
      traceId: ctx.traceId,
    });

    throw new ServiceUnavailableException({
      message: errorMessage,
      errorCode: 'CONNECTION_ERROR',
      code: err.code,
    });
  }

  /**
   * Handle Timeout Errors
   */
  private handleTimeoutError(ctx: ErrorContext, error: any): never {
    const messageOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity!,
      id: ctx.id,
      reason: 'Request timed out',
      status: 'error',
      metadata: {
        errorCode: 'TIMEOUT_ERROR',
      },
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.error(ctx as LoggerContext, error, 'failed', {
      errorType: 'TimeoutError',
      traceId: ctx.traceId,
    });

    throw new RequestTimeoutException({
      message: errorMessage,
      errorCode: 'TIMEOUT_ERROR',
    });
  }

  /**
   * Handle Validation Errors
   */
  private handleValidationError(ctx: ErrorContext, error: any): never {
    const validationErrors = this.extractValidationErrors(error);

    const messageOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity!,
      id: ctx.id,
      reason: `Validation failed: ${validationErrors.join(', ')}`,
      status: 'error',
      metadata: {
        errorCode: 'VALIDATION_ERROR',
        errors: validationErrors,
      },
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.warn(ctx as LoggerContext, 'failed', 'Validation failed', {
      errorType: 'ValidationError',
      errors: validationErrors,
      traceId: ctx.traceId,
    });

    throw new BadRequestException({
      message: errorMessage,
      errorCode: 'VALIDATION_ERROR',
      errors: validationErrors,
    });
  }

  /**
   * Handle HTTP Exceptions
   */
  private handleHttpException(ctx: ErrorContext, error: HttpException): never {
    const status = error.getStatus();
    const response = error.getResponse();

    let action: Action = 'failed';
    const reason = error.message;

    // Determine action based on status code
    if (status === 404) action = 'failed';
    else if (status === 401) action = 'failed';
    else if (status === 403) action = 'failed';
    else if (status === 409) action = 'failed';

    const messageOptions: MessageOptions = {
      action,
      entity: ctx.entity!,
      id: ctx.id,
      reason,
      status: 'error',
      metadata: {
        statusCode: status,
        errorCode: this.getErrorCodeFromStatus(status),
      },
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.error(ctx as LoggerContext, error, action, {
      errorType: 'HttpException',
      statusCode: status,
      traceId: ctx.traceId,
    });

    // Re-throw with enhanced message
    throw new HttpException(
      {
        message: errorMessage,
        errorCode: this.getErrorCodeFromStatus(status),
        statusCode: status,
        ...(typeof response === 'object' && response),
      },
      status,
    );
  }

  /**
   * Handle Unknown Errors
   */
  private handleUnknownError(ctx: ErrorContext, error: any): never {
    const err = error as ErrorLike;

    const messageOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity!,
      id: ctx.id,
      reason: this.isDevelopment
        ? (err.message as string) || err.name || 'Unknown error occurred'
        : 'An unexpected error occurred',
      status: 'error',
      metadata: {
        errorCode: 'INTERNAL_SERVER_ERROR',
        errorName: err.name,
      },
    };

    const errorMessage = generateAdvancedMessage(messageOptions);

    this.logger.error(ctx as LoggerContext, error, 'failed', {
      errorType: 'UnknownError',
      errorName: err.name,
      traceId: ctx.traceId,
    });

    throw new InternalServerErrorException({
      message: errorMessage,
      errorCode: 'INTERNAL_SERVER_ERROR',
      ...(this.isDevelopment && {
        errorName: err.name,
        details: err.message,
      }),
    });
  }

  /**
   * Helper: Check if database connection error
   */
  private isDatabaseConnectionError(error: any): boolean {
    const err = error as ErrorLike;
    return ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].includes(
      err.code || '',
    );
  }

  /**
   * Helper: Check if timeout error
   */
  private isTimeoutError(error: any): boolean {
    const err = error as ErrorLike;
    return (
      err?.code === 'ETIMEDOUT' ||
      /timeout/i.test((err?.message as string) || '') ||
      err?.name === 'TimeoutError'
    );
  }

  /**
   * Helper: Check if validation error
   */
  private isValidationError(error: any): boolean {
    const err = error as ErrorLike;
    return (
      err?.name === 'ValidationError' ||
      (Array.isArray(err?.response?.message) && err?.status === 400) ||
      (Array.isArray(err?.message) &&
        err.message.some((m: any) => typeof m === 'string'))
    );
  }

  /**
   * Helper: Extract field name from error message
   */
  private extractFieldFromError(message: string, constraint: string): string {
    // Try to extract from constraint name first
    if (constraint) {
      // Pattern: table_field_key or uq_table_field
      const match = constraint.match(/(?:uq_|uk_)?(?:\w+_)?(\w+)(?:_key)?/i);
      if (match && match[1]) return match[1];
    }

    // Try to extract from message
    const patterns = [
      /column "(\w+)"/i,
      /field '(\w+)'/i,
      /key '(\w+)'/i,
      /\((\w+)\)/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) return match[1];
    }

    return 'unknown field';
  }

  /**
   * Helper: Extract related entity from foreign key error
   */
  private extractRelatedEntity(message: string, constraint: string): string {
    // Try constraint name: fk_table_relatedtable
    if (constraint) {
      const match = constraint.match(/fk_\w+_(\w+)/i);
      if (match && match[1]) return match[1];
    }

    // Try message
    const match = message.match(/table "(\w+)"/i);
    if (match && match[1]) return match[1];

    return 'related entity';
  }

  /**
   * Helper: Extract validation errors
   */
  private extractValidationErrors(error: any): string[] {
    const err = error as ErrorLike;
    if (Array.isArray(err?.response?.message)) {
      return err.response.message;
    }

    if (Array.isArray(err?.message)) {
      return err.message.filter((m: any) => typeof m === 'string');
    }

    return [err?.message || 'Validation failed'];
  }

  /**
   * Helper: Get error code from HTTP status
   */
  private getErrorCodeFromStatus(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };

    return codes[status] || 'UNKNOWN_ERROR';
  }

  /**
   * Handle error with custom message options
   */
  handleWithOptions(
    ctx: LoggerContext,
    error: any,
    messageOptions: Partial<MessageOptions>,
  ): never {
    const fullOptions: MessageOptions = {
      action: 'failed',
      entity: ctx.entity,
      id: ctx.id,
      status: 'error',
      ...messageOptions,
    };

    const errorMessage = generateAdvancedMessage(fullOptions);

    this.logger.error(ctx, error, fullOptions.action, {
      ...fullOptions.metadata,
    });

    const statusCode = this.getStatusCodeFromError(error);

    throw new HttpException(
      {
        message: errorMessage,
        ...fullOptions.metadata,
      },
      statusCode,
    );
  }

  /**
   * Helper: Get status code from error
   */
  private getStatusCodeFromError(error: any): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    if (error instanceof QueryFailedError) {
      const message = error.message?.toLowerCase() || '';
      if (message.includes('duplicate') || message.includes('unique'))
        return 409;
      if (message.includes('foreign key')) return 400;
      return 500;
    }

    return 500;
  }
}
