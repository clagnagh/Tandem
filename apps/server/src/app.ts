// Builds the Fastify app without starting it, so tests can use app.inject().
import { randomUUID } from 'node:crypto';
import type { Database } from '@tandem/db';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Mailer } from './mail/mailer.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { registerErrorHandler } from './plugins/error-handler.ts';

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
}

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
  });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  registerErrorHandler(app);
  void app.register(healthRoutes({ pingDatabase: deps.database.ping }));
  // Phase 1 modules (auth, workspaces, projects, tasks) register under
  // /api/v1 here, one plugin per module.

  return app;
}
