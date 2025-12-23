import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED', // Hoạt động bình thường
  OPEN = 'OPEN', // Lỗi quá nhiều, reject ngay
  HALF_OPEN = 'HALF_OPEN', // Đang thử phục hồi
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Số lần fail để chuyển sang OPEN
  successThreshold: number; // Số lần success để chuyển về CLOSED
  timeout: number; // Thời gian chờ trước khi thử lại (ms)
  monitoringPeriod?: number; // Reset failure count sau X ms
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5, // Fail 5 lần → OPEN
      successThreshold: 2, // Success 2 lần → CLOSED
      timeout: 60000, // Chờ 60s trước khi thử lại
      monitoringPeriod: 120000, // Reset count sau 2 phút
    },
  ) {}

  async excute<T>(fn: () => Promise<T>, operationName?: string): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now >= this.nextAttemptTime) {
        this.logger.warn(
          `Circuit breaker HALF_OPEN for ${operationName || 'operation'}`,
        );
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        const waitTime = Math.ceil((this.nextAttemptTime - now) / 1000);
        this.logger.error(
          `Circuit breaker OPEN for ${operationName || 'operation'}, wait ${waitTime}s`,
        );
        throw new Error(
          `Circuit breaker is OPEN. Retry in ${waitTime} seconds.`,
        );
      }
    }

    try {
      const result = await fn();

      // Success
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      // Failure
      this.onFailure(error, operationName);
      throw error;
    }
  }

  private onSuccess(operationName?: string): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      this.logger.log(
        `Circuit breaker success ${this.successCount}/${this.config.successThreshold} for ${operationName}`,
      );

      // Đủ số lần success → Chuyển về CLOSED
      if (this.successCount >= this.config.successThreshold) {
        this.logger.log(
          `Circuit breaker CLOSED for ${operationName || 'operation'}`,
        );
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  private onFailure(error: any, operationName?: string): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    this.logger.error(
      `Circuit breaker failure ${this.failureCount}/${this.config.failureThreshold} for ${operationName}`,
      // error.message,
    );

    // Đủ số lần fail → Chuyển sang OPEN
    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.config.failureThreshold
    ) {
      this.logger.error(
        `Circuit breaker OPEN for ${operationName || 'operation'}`,
      );
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.logger.log('Circuit breaker reset to CLOSED');
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}
