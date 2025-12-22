import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT,
  ttl: process.env.REDIS_TTL,
  redisPassword: process.env.REDIS_PASSWORD || '',
  redisDB: process.env.REDIS_DB,
}));
