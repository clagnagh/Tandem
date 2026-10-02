// The one place errors become HTTP responses. Every error body has the same
// shape: { error: { code, message, requestId } }. Unexpected errors are
// logged in full but reach the client as a generic 500, so stack traces and
// internals never leak.
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, RateLimitedError } from '../errors.ts';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      if (error instanceof RateLimitedError) {
        void reply.header('retry-after', String(error.retryAfterSeconds));
      }
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, requestId } });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: 'The request is not valid',
          requestId,
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    // Fastify's own client errors (malformed JSON, body too large, ...).
    const statusCode = 'statusCode' in error ? error.statusCode : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply
        .status(statusCode)
        .send({ error: { code: 'bad_request', message: error.message, requestId } });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'internal', message: 'Internal server error', requestId } });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send({ error: { code: 'not_found', message: 'Route not found', requestId: request.id } });
  });
}
