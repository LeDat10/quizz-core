import { LogLevel } from '@nestjs/common';

export interface LogMetadata {
  [key: string]: any;
  timestamp?: string;
  traceId?: string;
  userId?: string;
  duration?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface PerformanceMetrics {
  startTime: number;
  operation: string;
  checkpoints: Array<{ name: string; time: number }>;
}

export interface LoggerOptions {
  enablePerformanceTracking?: boolean;
  enableStructuredLogging?: boolean;
  logLevels?: LogLevel[];
  sensitiveFields?: string[];
  maxMetadataSize?: number;
}
