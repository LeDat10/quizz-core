import { Logger } from '@nestjs/common';
import { LoggerOptions, LogMetadata, PerformanceMetrics } from './logger.types';
import { LoggerContext } from './logger-context.interface';
import { Action, MessageOptions } from '../messaging/message.types';
import {
  generateAdvancedMessage,
  generateMessage,
  generateProgressMessage,
  generateRelationMessage,
} from '../messaging/message.util';

export class LoggerHelper {
  private readonly logger: Logger;
  private readonly enablePerformanceTracking: boolean;
  private readonly enableStructuredLogging: boolean;
  private readonly performanceMetrics: Map<string, PerformanceMetrics>;
  private readonly sensitiveFields: Set<string>;
  private readonly maxMetadataSize: number;

  constructor(
    private readonly serviceName: string,
    options: LoggerOptions = {},
  ) {
    this.logger = new Logger(serviceName, {
      timestamp: true,
    });

    this.enablePerformanceTracking = options.enablePerformanceTracking ?? true;
    this.enableStructuredLogging = options.enableStructuredLogging ?? false;
    this.performanceMetrics = new Map();
    this.sensitiveFields = new Set(
      options.sensitiveFields || [
        'password',
        'token',
        'secret',
        'apiKey',
        'creditCard',
        'ssn',
      ],
    );
    this.maxMetadataSize = options.maxMetadataSize || 10000; // 10KB
  }

  /**
   * Mask sensitive data in metadata
   */
  private maskSensitiveData(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.maskSensitiveData(item));
    }

    const masked = { ...obj };
    for (const key in masked) {
      if (this.sensitiveFields.has(key.toLowerCase())) {
        masked[key] = '***MASKED***';
      } else if (typeof masked[key] === 'object') {
        masked[key] = this.maskSensitiveData(masked[key]);
      }
    }
    return masked;
  }

  /**
   * Format metadata với size limit
   */
  private formatMetadata(meta?: LogMetadata): string {
    if (!meta || Object.keys(meta).length === 0) return '';

    try {
      const masked = this.maskSensitiveData(meta);
      let json = JSON.stringify(masked, null, 2);

      // Check size limit
      if (json.length > this.maxMetadataSize) {
        json = json.substring(0, this.maxMetadataSize) + '... [truncated]';
      }

      return json;
    } catch (error: unknown) {
      console.error('Error formatting metadata:', error);
      return '[Invalid Metadata]';
    }
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Format message cơ bản
   */
  private formatMessage(
    context: LoggerContext,
    action: Action,
    reason?: string,
  ): string {
    return `[${context.method}] ${generateMessage(action, context.entity, context.id, reason)}`;
  }

  /**
   * Format message nâng cao
   */
  private formatAdvancedMessage(
    context: LoggerContext,
    options: Partial<MessageOptions>,
  ): string {
    return `[${context.method}] ${generateAdvancedMessage({
      action: options.action!,
      entity: context.entity,
      id: context.id,
      ...options,
    })}`;
  }

  /**
   * Log structured (JSON format)
   */
  private logStructured(
    level: string,
    message: string,
    context: LoggerContext,
    meta?: LogMetadata,
  ): void {
    if (!this.enableStructuredLogging) return;

    const structured = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      method: context.method,
      entity: context.entity,
      id: context.id,
      message,
      ...meta,
    };

    console.log(JSON.stringify(structured));
  }

  /**
   * INFO - Log thông tin bình thường
   */
  info(
    context: LoggerContext,
    action: Action,
    reason?: string,
    meta?: LogMetadata,
  ): void {
    const message = this.formatMessage(context, action, reason);

    if (meta) {
      this.logger.log(`${message} | ${this.formatMetadata(meta)}`);
    } else {
      this.logger.log(message);
    }

    this.logStructured('info', message, context, meta);
  }

  /**
   * WARN - Log cảnh báo
   */
  warn(
    context: LoggerContext,
    action: Action,
    reason?: string,
    meta?: LogMetadata,
  ): void {
    const message = this.formatMessage(context, action, reason);

    if (meta) {
      this.logger.warn(`${message} | ${this.formatMetadata(meta)}`);
    } else {
      this.logger.warn(message);
    }

    this.logStructured('warn', message, context, meta);
  }

  /**
   * ERROR - Log lỗi
   */
  error(
    context: LoggerContext,
    error: Error | string,
    action?: Action,
    meta?: LogMetadata,
  ): void {
    const actionType = action || 'failed';
    const message = this.formatMessage(context, actionType);

    if (error instanceof Error) {
      const errorInfo = {
        name: error.name,
        message: error.message,
        ...meta,
      };

      this.logger.error(
        `${message} | ${this.formatMetadata(errorInfo)}`,
        error.stack,
      );

      this.logStructured('error', message, context, {
        ...errorInfo,
        stack: error.stack,
      });
    } else {
      this.logger.error(
        `${message} | Reason: ${error}${meta ? ' | ' + this.formatMetadata(meta) : ''}`,
      );

      this.logStructured('error', message, context, {
        reason: error,
        ...meta,
      });
    }
  }

  /**
   * DEBUG - Log debug
   */
  debug(
    context: LoggerContext,
    action: Action,
    reason?: string,
    meta?: LogMetadata,
  ): void {
    if (process.env.NODE_ENV === 'production') return;

    const message = this.formatMessage(context, action, reason);

    if (meta) {
      this.logger.debug(`${message} | ${this.formatMetadata(meta)}`);
    } else {
      this.logger.debug(message);
    }

    this.logStructured('debug', message, context, meta);
  }

  /**
   * VERBOSE - Log chi tiết
   */
  verbose(
    context: LoggerContext,
    action: Action,
    reason?: string,
    meta?: LogMetadata,
  ): void {
    if (process.env.NODE_ENV === 'production') return;

    const message = this.formatMessage(context, action, reason);

    if (meta) {
      this.logger.verbose(`${message} | ${this.formatMetadata(meta)}`);
    } else {
      this.logger.verbose(message);
    }

    this.logStructured('verbose', message, context, meta);
  }

  /**
   * START - Bắt đầu operation với performance tracking
   */
  start(context: LoggerContext, meta?: LogMetadata): string {
    const traceId = this.generateTraceId();

    if (this.enablePerformanceTracking) {
      this.performanceMetrics.set(traceId, {
        startTime: Date.now(),
        operation: context.method,
        checkpoints: [],
      });
    }

    this.info(context, 'start', undefined, {
      ...meta,
      traceId,
    });

    return traceId;
  }

  /**
   * CHECKPOINT - Đánh dấu checkpoint trong quá trình xử lý
   */
  checkpoint(
    traceId: string,
    checkpointName: string,
    context: LoggerContext,
    meta?: LogMetadata,
  ): void {
    const metrics = this.performanceMetrics.get(traceId);

    if (metrics && this.enablePerformanceTracking) {
      const checkpoint = {
        name: checkpointName,
        time: Date.now() - metrics.startTime,
      };

      metrics.checkpoints.push(checkpoint);

      this.debug(context, 'processing', `Checkpoint: ${checkpointName}`, {
        ...meta,
        traceId,
        duration: `${checkpoint.time}ms`,
      });
    }
  }

  /**
   * SUCCESS - Kết thúc thành công
   */
  success(
    context: LoggerContext,
    traceId?: string,
    action?: Action,
    meta?: LogMetadata,
  ): void {
    const metrics = traceId ? this.performanceMetrics.get(traceId) : null;
    let enrichedMeta = { ...meta };

    if (metrics && this.enablePerformanceTracking) {
      const duration = Date.now() - metrics.startTime;
      enrichedMeta = {
        ...enrichedMeta,
        duration: `${duration}ms`,
        traceId,
        checkpoints: metrics.checkpoints,
      };
      this.performanceMetrics.delete(traceId as string);

      // Warn nếu operation quá chậm
      if (duration > 5000) {
        this.warn(
          context,
          'warning',
          `Slow operation: ${duration}ms`,
          enrichedMeta,
        );
      }
    }

    this.info(context, action || 'success', undefined, enrichedMeta);
  }

  /**
   * FAIL - Kết thúc thất bại
   */
  fail(
    context: LoggerContext,
    error: Error | string,
    traceId?: string,
    action?: Action,
    meta?: LogMetadata,
  ): void {
    const metrics = traceId ? this.performanceMetrics.get(traceId) : null;
    let enrichedMeta = { ...meta };

    if (metrics && this.enablePerformanceTracking) {
      const duration = Date.now() - metrics.startTime;
      enrichedMeta = {
        ...enrichedMeta,
        duration: `${duration}ms`,
        traceId,
        checkpoints: metrics.checkpoints,
      };
      this.performanceMetrics.delete(traceId as string);
    }

    this.error(context, error, action || 'failed', enrichedMeta);
  }

  /**
   * BATCH - Log batch operations
   */
  logBatch(
    context: LoggerContext,
    action: Action,
    total: number,
    successful: number,
    failed: number,
    reason?: string,
    meta?: LogMetadata,
  ): void {
    const enrichedMeta = {
      ...meta,
      total,
      successful,
      failed,
      successRate: `${Math.round((successful / total) * 100)}%`,
    };

    if (failed > 0) {
      this.warn(context, action, reason, enrichedMeta);
    } else {
      this.info(context, action, undefined, enrichedMeta);
    }
  }

  /**
   * PROGRESS - Log progress
   */
  logProgress(
    context: LoggerContext,
    action: Action,
    current: number,
    total: number,
    meta?: LogMetadata,
  ): void {
    const message = `[${context.method}] ${generateProgressMessage(
      action,
      context.entity,
      current,
      total,
    )}`;

    this.logger.log(`${message} | ${this.formatMetadata(meta)}`);
  }

  /**
   * COMPARISON - Log changes
   */
  logComparison(
    context: LoggerContext,
    oldValue: unknown,
    newValue: unknown,
    field?: string,
    meta?: LogMetadata,
  ): void {
    this.info(context, 'updated', undefined, {
      ...meta,
      oldValue,
      newValue,
      field,
    });
  }

  /**
   * RELATION - Log relationship changes
   */
  logRelation(
    action: 'attached' | 'detached' | 'linked' | 'unlinked',
    parentContext: LoggerContext,
    childEntity: string,
    childId: number | string,
    meta?: LogMetadata,
  ): void {
    const message = `[${parentContext.method}] ${generateRelationMessage(
      action,
      parentContext.entity,
      parentContext.id!,
      childEntity,
      childId,
    )}`;

    this.logger.log(`${message} | ${this.formatMetadata(meta)}`);
  }

  /**
   * HTTP REQUEST - Log HTTP requests
   */
  logRequest(
    method: string,
    url: string,
    statusCode?: number,
    meta?: LogMetadata,
  ): void {
    const message = `${method} ${url}${statusCode ? ` - ${statusCode}` : ''}`;

    if (statusCode && statusCode >= 400) {
      this.logger.warn(`${message} | ${this.formatMetadata(meta)}`);
    } else {
      this.logger.log(`${message} | ${this.formatMetadata(meta)}`);
    }
  }

  /**
   * DATABASE QUERY - Log queries
   */
  logQuery(query: string, duration: number, meta?: LogMetadata): void {
    const truncatedQuery =
      query.length > 200 ? query.substring(0, 200) + '...' : query;

    const enrichedMeta = {
      ...meta,
      duration: `${duration}ms`,
      queryLength: query.length,
    };

    if (duration > 1000) {
      this.logger.warn(
        `Slow Query: ${truncatedQuery} | ${this.formatMetadata(enrichedMeta)}`,
      );
    } else if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `Query: ${truncatedQuery} | ${this.formatMetadata(enrichedMeta)}`,
      );
    }
  }

  /**
   * SECURITY - Log security events
   */
  logSecurity(
    event:
      | 'login'
      | 'logout'
      | 'failed_login'
      | 'permission_denied'
      | 'suspicious_activity',
    context: LoggerContext,
    meta?: LogMetadata,
  ): void {
    const message = `[SECURITY] ${event.toUpperCase()}: ${context.method}`;

    const enrichedMeta = {
      ...meta,
      securityEvent: event,
      timestamp: new Date().toISOString(),
    };

    if (event === 'failed_login' || event === 'suspicious_activity') {
      this.logger.warn(`${message} | ${this.formatMetadata(enrichedMeta)}`);
    } else {
      this.logger.log(`${message} | ${this.formatMetadata(enrichedMeta)}`);
    }
  }

  /**
   * CLEANUP - Xóa metrics cũ
   */
  cleanup(): void {
    this.performanceMetrics.clear();
  }

  /**
   * Get active metrics count
   */
  getActiveMetricsCount(): number {
    return this.performanceMetrics.size;
  }

  /**
   * Get metrics for a trace ID
   */
  getMetrics(traceId: string): PerformanceMetrics | undefined {
    return this.performanceMetrics.get(traceId);
  }
}
