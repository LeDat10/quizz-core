export interface SlugGenerationResult {
  slug: string;
  lockKey: string;
  lockId: string;
  attempts: number;
}

export interface SlugExistenceChecker {
  (slug: string): Promise<boolean>;
}

export interface SlugGenerationOptions {
  maxRetries?: number;
  lockTTL?: number;
  lockRetries?: number;
  prefix?: string;
  randomLength?: number;
}
