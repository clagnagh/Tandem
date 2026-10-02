// GET /health: liveness plus database connectivity. Used by the host's health
// checks and the deploy smoke test, so it needs no auth and returns no data.
import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@tandem/shared';

const DB_TIMEOUT_MS = 2_000;

export interface HealthDeps {
  pingDatabase: () => Promise<void>;
}

async function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${ms} ms`));
    }, ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function healthRoutes(deps: HealthDeps) {
  return function register(app: FastifyInstance): void {
    app.get('/health', async (request, reply) => {
      try {
        await withTimeout(deps.pingDatabase(), DB_TIMEOUT_MS);
        const body: HealthResponse = { status: 'ok', database: 'up' };
        return await reply.send(body);
      } catch (err) {
        request.log.warn({ err }, 'health check: database unreachable');
        const body: HealthResponse = { status: 'error', database: 'down' };
        return await reply.status(503).send(body);
      }
    });
  };
}
