export const QUEUE_CONSTANTS = {
  // Queue names
  NAMES: {
    STATUS_CASCADE: 'status-cascade',
    STATUS_CASCADE_LEVEL: 'status-cascade-level',
    STATUS_CASCADE_DLQ: 'status-cascade-dlq',
  },

  // Job options
  DEFAULT_JOB_OPTIONS: {
    ATTEMPTS: 3,
    BACKOFF_DELAY: 2000,
    RETENTION: {
      COMPLETED_AGE: 3600, // 1 hour
      COMPLETED_COUNT: 1000,
      FAILED_DAYS: 7,
    },
  },
} as const;
