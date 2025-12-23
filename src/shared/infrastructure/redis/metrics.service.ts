import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // Counters (đếm số lần xảy ra)
  private readonly lockAcquireCounter: Counter;
  private readonly lockReleaseCounter: Counter;
  private readonly lockFailureCounter: Counter;

  // Histograms (đo thời gian/duration)
  private readonly lockAcquireDuration: Histogram;
  private readonly lockHoldDuration: Histogram;

  // Gauges (giá trị hiện tại)
  private readonly activeLocks: Gauge;
  private readonly redisConnectionStatus: Gauge;

  constructor() {
    this.registry = new Registry();

    // Lock acquire counter
    this.lockAcquireCounter = new Counter({
      name: 'lock_acquire_total',
      help: 'Total number of lock acquire attempts',
      labelNames: ['key', 'status'], // status: success | failure
      registers: [this.registry],
    });

    // Lock release counter
    this.lockReleaseCounter = new Counter({
      name: 'lock_release_total',
      help: 'Total number of lock release attempts',
      labelNames: ['key', 'status'],
      registers: [this.registry],
    });

    //  Lock failure counter
    this.lockFailureCounter = new Counter({
      name: 'lock_failure_total',
      help: 'Total number of lock failures',
      labelNames: ['key', 'reason'], // reason: timeout | conflict | error
      registers: [this.registry],
    });

    //  Lock acquire duration histogram
    this.lockAcquireDuration = new Histogram({
      name: 'lock_acquire_duration_ms',
      help: 'Duration of lock acquire operations in milliseconds',
      labelNames: ['key'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000], // ms
      registers: [this.registry],
    });

    //  Lock hold duration histogram
    this.lockHoldDuration = new Histogram({
      name: 'lock_hold_duration_ms',
      help: 'Duration that locks are held in milliseconds',
      labelNames: ['key'],
      buckets: [100, 500, 1000, 2000, 5000, 10000, 30000], // ms
      registers: [this.registry],
    });

    //  Active locks gauge
    this.activeLocks = new Gauge({
      name: 'lock_active_count',
      help: 'Number of currently active locks',
      labelNames: ['key'],
      registers: [this.registry],
    });

    //  Redis connection status
    this.redisConnectionStatus = new Gauge({
      name: 'redis_connection_status',
      help: 'Redis connection status (1 = connected, 0 = disconnected)',
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // Default metrics (CPU, memory, etc.)
    this.registry.setDefaultLabels({
      app: 'my-app',
      env: process.env.NODE_ENV || 'development',
    });
  }

  // Public methods để record metrics
  recordLockAcquire(params: {
    key: string;
    duration: number;
    success: boolean;
  }): void {
    const { key, duration, success } = params;

    // Counter
    this.lockAcquireCounter.inc({
      key,
      status: success ? 'success' : 'failure',
    });

    // Histogram
    this.lockAcquireDuration.observe({ key }, duration);

    // Gauge (increase active locks)
    if (success) {
      this.activeLocks.inc({ key });
    }
  }

  recordLockRelease(params: {
    key: string;
    duration: number;
    success: boolean;
  }): void {
    const { key, duration, success } = params;

    // Counter
    this.lockReleaseCounter.inc({
      key,
      status: success ? 'success' : 'failure',
    });

    // Histogram (thời gian giữ lock)
    this.lockHoldDuration.observe({ key }, duration);

    // Gauge (decrease active locks)
    if (success) {
      this.activeLocks.dec({ key });
    }
  }

  /**
   * Record lock failure
   */
  recordLockFailure(params: {
    key: string;
    reason: 'timeout' | 'conflict' | 'error';
  }): void {
    const { key, reason } = params;
    this.lockFailureCounter.inc({ key, reason });
  }

  /**
   * Update Redis connection status
   */
  recordRedisHealth(status: 'up' | 'down'): void {
    this.redisConnectionStatus.set(status === 'up' ? 1 : 0);
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    const metrics = await this.registry.getMetricsAsJSON();
    return metrics;
  }
}
