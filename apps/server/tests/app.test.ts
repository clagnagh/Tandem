import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.ts';
import { ConflictError, RateLimitedError } from '../src/errors.ts';
import { captureLogger } from './helpers.ts';

function appWith(pingDatabase: () => Promise<void> = () => Promise.resolve()) {
  const log = captureLogger();
  const app = buildApp({ logger: log.logger, pingDatabase });
  return { app, log };
}

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    const { app } = appWith();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    const { app } = appWith(() => Promise.reject(new Error('connection refused')));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'error', database: 'down' });
  });
});

describe('request ids', () => {
  it('generates one and returns it in a header', async () => {
    const { app } = appWith();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a well-formed incoming id', async () => {
    const { app } = appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'trace-12345678' },
    });
    expect(res.headers['x-request-id']).toBe('trace-12345678');
  });

  it('replaces an incoming id that could inject text into logs', async () => {
    const { app } = appWith();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'evil\nfake log line' },
    });
    expect(res.headers['x-request-id']).not.toContain('evil');
  });
});

describe('error handler', () => {
  function appWithRoutes() {
    const { app, log } = appWith();
    app.get('/conflict', () => {
      throw new ConflictError('Slug already taken', 'slug_taken');
    });
    app.get('/limited', () => {
      throw new RateLimitedError(42);
    });
    app.post('/validated', (request) => z.strictObject({ name: z.string() }).parse(request.body));
    app.get('/boom', () => {
      throw new Error('db password is hunter2');
    });
    return { app, log };
  }

  it('maps an AppError to its status and code', async () => {
    const { app } = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: { code: 'slug_taken', message: 'Slug already taken' },
    });
    expect(res.json<{ error: { requestId: string } }>().error.requestId).toBe(
      res.headers['x-request-id'],
    );
  });

  it('sets Retry-After on rate limit errors', async () => {
    const { app } = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/limited' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('42');
  });

  it('turns a Zod error into a 400 listing the problems', async () => {
    const { app } = appWithRoutes();
    const res = await app.inject({
      method: 'POST',
      url: '/validated',
      payload: { name: 'ok', extra: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('rejects malformed JSON with a 400, not a 500', async () => {
    const { app } = appWithRoutes();
    const res = await app.inject({
      method: 'POST',
      url: '/validated',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(res.statusCode).toBe(400);
  });

  it('hides unexpected errors from the client but logs them', async () => {
    const { app, log } = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('hunter2');
    expect(res.json()).toMatchObject({ error: { code: 'internal' } });
    expect(log.text()).toContain('unhandled error');
  });

  it('answers unknown routes with the same error shape', async () => {
    const { app } = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('logging', () => {
  it('redacts passwords and cookies if they are ever logged', () => {
    const log = captureLogger();
    log.logger.info(
      { body: { email: 'a@example.com', password: 'correct horse battery staple' } },
      'sign-in attempt',
    );
    log.logger.info({ req: { headers: { cookie: 'session=abc123' } } }, 'request');
    expect(log.text()).not.toContain('correct horse');
    expect(log.text()).not.toContain('abc123');
    expect(log.text()).toContain('[Redacted]');
  });
});
