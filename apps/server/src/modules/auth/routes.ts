// Mounts Better Auth under /api/v1/auth. Better Auth speaks the web-standard
// Request/Response API, so each Fastify request is converted to a Request and
// the Response is copied back onto the reply.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RateLimitedError, ServiceUnavailableError } from '../../errors.ts';
import type { RateLimiter } from './rate-limit.ts';
import { AUTH_BASE_PATH, type Auth } from './auth.ts';

export interface AuthRouteDeps {
  auth: Auth;
  loginLimiter: RateLimiter;
  appUrl: string;
}

const SIGN_IN_PATH = `${AUTH_BASE_PATH}/sign-in/email`;

function emailFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('email' in body)) return undefined;
  return typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
}

/** Copies Node-style request headers into a web-standard Headers object. */
export function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  return headers;
}

function toWebRequest(request: FastifyRequest, appUrl: string): Request {
  const headers = toHeaders(request);
  // Replace whatever the client sent with the IP Fastify resolved, which
  // honours X-Forwarded-For only from trusted proxies.
  headers.set('x-forwarded-for', request.ip);
  const hasBody = request.method !== 'GET' && request.body !== undefined;
  return new Request(new URL(request.url, appUrl), {
    method: request.method,
    headers,
    ...(hasBody && { body: JSON.stringify(request.body) }),
  });
}

/**
 * Better Auth returns the session token in some JSON bodies (sign-in,
 * get-session) for clients that use bearer tokens. Tandem only uses the
 * HttpOnly cookie, and a token readable from JavaScript would let an XSS bug
 * steal the session, so it is removed.
 */
export function withoutSessionToken(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;
  const { token: _token, ...rest } = body as Record<string, unknown>;
  const session = rest.session;
  if (typeof session === 'object' && session !== null) {
    const { token: _sessionToken, ...safeSession } = session as Record<string, unknown>;
    rest.session = safeSession;
  }
  return rest;
}

async function sendWebResponse(reply: FastifyReply, response: Response) {
  void reply.status(response.status);
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie' && name !== 'content-length') void reply.header(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) void reply.header('set-cookie', cookies);
  if (!response.body) return reply.send(null);
  const text = await response.text();
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  if (!isJson || text === '') return reply.send(text);
  return reply.send(withoutSessionToken(JSON.parse(text) as unknown));
}

export function authRoutes(deps: AuthRouteDeps) {
  return function register(app: FastifyInstance): void {
    app.route({
      method: ['GET', 'POST'],
      url: `${AUTH_BASE_PATH}/*`,
      preHandler: async (request) => {
        // Compare the path Better Auth will route on: URL parsing resolves
        // "/auth/./sign-in/email" and "/auth/x/../sign-in/email" to sign-in,
        // so the raw request.url would let those skip the limit.
        const path = new URL(request.url, deps.appUrl).pathname;
        if (request.method !== 'POST' || path !== SIGN_IN_PATH) return;
        // Every attempt counts, right or wrong (docs/spec/phase-1.md, question 5).
        const email = emailFrom(request.body);
        const keys = [`login:ip:${request.ip}`, ...(email ? [`login:email:${email}`] : [])];
        let result;
        try {
          result = await deps.loginLimiter.hit(keys);
        } catch (err) {
          // Fail closed: without Redis we cannot count attempts (docs/adr/0009).
          request.log.error({ err }, 'login rate limiter unavailable');
          throw new ServiceUnavailableError('Sign-in is temporarily unavailable');
        }
        if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
      },
      handler: async (request, reply) => {
        const response = await deps.auth.handler(toWebRequest(request, deps.appUrl));
        return sendWebResponse(reply, response);
      },
    });
  };
}
