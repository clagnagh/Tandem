// Builds the Fastify app without starting it, so tests can use app.inject().
import { randomUUID } from 'node:crypto';
import type { Database } from '@tandem/db';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { LOGIN_RATE_LIMIT } from '@tandem/shared';
import type { Mailer } from './mail/mailer.ts';
import { createAuth } from './modules/auth/auth.ts';
import { createRateLimiter } from './modules/auth/rate-limit.ts';
import { authRoutes } from './modules/auth/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { registerErrorHandler } from './plugins/error-handler.ts';
import { registerOriginCheck } from './plugins/origin-check.ts';
import { createRedis } from './redis.ts';

/** Everything the app talks to, passed in so tests can supply their own. */
export interface AppDeps {
  logger: FastifyBaseLogger;
  database: {
    db: Database;
    /** Resolves if the database answers. Used by /health. */
    ping: () => Promise<void>;
  };
  /** Rate limits (step 4). Keys start with keyPrefix so tests can share a server. */
  redis: { url: string; keyPrefix: string };
  mailer: Mailer;
  auth: {
    /** The browser-facing origin, e.g. http://localhost:3000 (docs/adr/0002). */
    appUrl: string;
    secret: string;
    github?: { clientId: string; clientSecret: string };
  };
  /**
   * Addresses allowed to set X-Forwarded-For (the Next.js server). Requests
   * from anywhere else are identified by their TCP address.
   */
  trustedProxies?: string[];
}

const DEFAULT_TRUSTED_PROXIES = ['127.0.0.1', '::1'];

// Accept a caller's request id only if it looks like an id, so a client
// cannot write arbitrary text into our logs.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
export const REQUEST_ID_HEADER = 'x-request-id';

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers[REQUEST_ID_HEADER];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
    },
    bodyLimit: 1_048_576, // 1 MiB
    trustProxy: deps.trustedProxies ?? DEFAULT_TRUSTED_PROXIES,
  });

  const redis = createRedis(deps.redis.url, deps.logger);
  app.addHook('onClose', () => {
    redis.disconnect();
  });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  registerErrorHandler(app);
  registerOriginCheck(app, deps.auth.appUrl);

  void app.register(healthRoutes({ pingDatabase: deps.database.ping }));
  void app.register(
    authRoutes({
      auth: createAuth({
        db: deps.database.db,
        mailer: deps.mailer,
        logger: deps.logger,
        appUrl: deps.auth.appUrl,
        secret: deps.auth.secret,
        github: deps.auth.github,
      }),
      loginLimiter: createRateLimiter(redis, {
        keyPrefix: deps.redis.keyPrefix,
        maxAttempts: LOGIN_RATE_LIMIT.maxAttempts,
        windowSeconds: LOGIN_RATE_LIMIT.windowSeconds,
      }),
      appUrl: deps.auth.appUrl,
    }),
  );
  // Workspaces, projects and tasks (step 5) register under /api/v1 here.

  return app;
}
