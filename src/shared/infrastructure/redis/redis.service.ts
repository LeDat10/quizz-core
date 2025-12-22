import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
@Injectable()
export class RedisLockService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  async acquireLock(key: string, ttl: number = 10000): Promise<string | null> {
    const lockId = uuidv4();
    const result = await this.redisClient.set(
      `lock:${key}`,
      lockId,
      'PX',
      ttl,
      'NX',
    );
    return result === 'OK' ? lockId : null;
  }

  async releaseLock(key: string, lockId: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redisClient.eval(
      script,
      1,
      `lock:${key}`,
      lockId,
    );
    return result === 1;
  }
}
