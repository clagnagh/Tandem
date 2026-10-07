import { createDatabase, type DatabaseHandle } from '@tandem/db';
import { createTestDatabase } from '@tandem/db/testing';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../../src/app.ts';
import { captureLogger } from './logger.ts';
import { createMemoryMailer, type MemoryMailer } from './mailer.ts';
import { createTestRedis } from './redis.ts';

/** The browser origin in tests. Requests that change state send it as Origin. */
export const TEST_APP_URL = 'http://localhost:3000';
export const TEST_GITHUB = {
  clientId: 'test-github-client-id',
  clientSecret: 'test-github-secret',
};
const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

/**
 * Dependencies for unit tests that never touch the database or Redis. The
 * pool connects lazily, so a dummy URL is never dialled.
 */
export function unitTestDeps(overrides: Partial<AppDeps> = {}) {
  const log = captureLogger();
  const unused = createDatabase('postgresql://unused:unused@127.0.0.1:1/unused', { max: 1 });
  const deps: AppDeps = {
    logger: log.logger,
    database: { db: unused.db, ping: () => Promise.resolve() },
    redis: { url: 'redis://127.0.0.1:1', keyPrefix: 'unit:' },
    mailer: createMemoryMailer(),
    auth: { appUrl: TEST_APP_URL, secret: TEST_SECRET, github: TEST_GITHUB },
    ...overrides,
  };
  return { deps, log };
}

export interface TestApp {
  app: FastifyInstance;
  database: DatabaseHandle;
  outbox: MemoryMailer;
  log: ReturnType<typeof captureLogger>;
  close: () => Promise<void>;
}

/**
 * A fully wired app on a fresh, migrated database and isolated Redis keys.
 * `beforeReady` runs after the app is built but before plugins load, which
 * is the moment an onRoute hook can still see every route.
 */
export async function createTestApp(
  options: {
    beforeReady?: (app: FastifyInstance) => void;
    /** Point the app at this Redis instead, e.g. an unreachable one. */
    redisUrl?: string;
  } = {},
): Promise<TestApp> {
  const testDb = await createTestDatabase();
  const redis = options.redisUrl
    ? { url: options.redisUrl, keyPrefix: 'unused:', cleanup: () => Promise.resolve() }
    : await createTestRedis();
  const database = createDatabase(testDb.url, { max: 5 });
  const log = captureLogger();
  const outbox = createMemoryMailer();
  const app = buildApp({
    logger: log.logger,
    database,
    redis: { url: redis.url, keyPrefix: redis.keyPrefix },
    mailer: outbox,
    auth: { appUrl: TEST_APP_URL, secret: TEST_SECRET, github: TEST_GITHUB },
  });
  options.beforeReady?.(app);
  await app.ready();
  return {
    app,
    database,
    outbox,
    log,
    close: async () => {
      await app.close();
      await database.close();
      await redis.cleanup();
      await testDb.cleanup();
    },
  };
}
