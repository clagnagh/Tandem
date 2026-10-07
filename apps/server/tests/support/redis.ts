// Redis for integration tests, mirroring createTestDatabase (docs/adr/0007).
// With TEST_REDIS_URL set, tests share that server and isolate themselves
// with a random key prefix. Otherwise a container is started.
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

export interface TestRedis {
  url: string;
  keyPrefix: string;
  cleanup: () => Promise<void>;
}

export async function createTestRedis(): Promise<TestRedis> {
  const keyPrefix = `test:${randomUUID()}:`;
  const shared = process.env.TEST_REDIS_URL;
  if (shared) {
    return { url: shared, keyPrefix, cleanup: () => deleteKeys(shared, keyPrefix) };
  }
  const { RedisContainer } = await import('@testcontainers/redis');
  const container = await new RedisContainer('redis:7-alpine').start();
  return {
    url: container.getConnectionUrl(),
    keyPrefix,
    cleanup: async () => {
      await container.stop();
    },
  };
}

async function deleteKeys(url: string, prefix: string): Promise<void> {
  const redis = new Redis(url);
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
      if (keys.length > 0) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
}
