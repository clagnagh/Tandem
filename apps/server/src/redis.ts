import type { FastifyBaseLogger } from 'fastify';
import { Redis } from 'ioredis';

/**
 * Connects on first use, and fails a command fast instead of queueing it
 * forever while Redis is down, so callers can decide what to do.
 */
export function createRedis(url: string, logger: FastifyBaseLogger): Redis {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on('error', (err: Error) => {
    logger.warn({ err }, 'redis connection error');
  });
  return redis;
}
