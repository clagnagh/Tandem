// Helpers that talk to the app the way the browser does: through the HTTP
// API, with cookies, an Origin header and the client IP in X-Forwarded-For
// (Next.js forwards requests from 127.0.0.1, docs/adr/0002).
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { TEST_APP_URL } from './app.ts';
import { linkIn, tokenIn, type MemoryMailer } from './mailer.ts';

export const API = '/api/v1';
export const AUTH = `${API}/auth`;

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  cookie?: string;
  /** Client IP, sent as X-Forwarded-For. */
  ip?: string;
  /** The TCP peer. Defaults to 127.0.0.1, i.e. the Next.js proxy. */
  remoteAddress?: string;
  /** Defaults to the app's own origin. Pass null to send no Origin header. */
  origin?: string | null;
}

export function send(
  app: FastifyInstance,
  method: Method,
  url: string,
  options: RequestOptions = {},
): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = {};
  const origin = options.origin === undefined ? TEST_APP_URL : options.origin;
  if (origin !== null) headers.origin = origin;
  if (options.cookie) headers.cookie = options.cookie;
  if (options.ip) headers['x-forwarded-for'] = options.ip;
  return app.inject({
    method,
    url,
    headers,
    ...(options.remoteAddress && { remoteAddress: options.remoteAddress }),
    ...(options.body !== undefined && { payload: options.body as Record<string, unknown> }),
  });
}

/** Turns a response's Set-Cookie headers into a Cookie header for the next request. */
export function cookiesFrom(res: LightMyRequestResponse): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** A link from an email, as a path the test app can be asked for. */
export function pathOf(link: URL): string {
  return `${link.pathname}${link.search}`;
}

export interface TestUser {
  id: string;
  name: string;
  email: string;
  password: string;
  cookie: string;
}

let userCount = 0;
let ipCount = 0;

/**
 * A client IP no other request in the run uses, so tests do not trip each
 * other's login rate limit (5 attempts per IP per minute).
 */
export function uniqueIp(): string {
  ipCount += 1;
  return `10.${Math.floor(ipCount / 250) % 250}.${ipCount % 250}.1`;
}

/** A unique user, so tests never collide on email addresses or rate limits. */
export function newUser(name: string): Omit<TestUser, 'id' | 'cookie'> {
  userCount += 1;
  const slug = name.toLowerCase().replace(/\W+/g, '-');
  return {
    name,
    email: `${slug}-${userCount}-${Date.now()}@example.com`,
    password: `pw-${slug}-${userCount}-correct-horse`,
  };
}

export function signUp(app: FastifyInstance, user: Omit<TestUser, 'id' | 'cookie'>) {
  return send(app, 'POST', `${AUTH}/sign-up/email`, {
    body: { name: user.name, email: user.email, password: user.password },
  });
}

export function signIn(
  app: FastifyInstance,
  credentials: { email: string; password: string },
  options: RequestOptions = {},
) {
  return send(app, 'POST', `${AUTH}/sign-in/email`, { ...options, body: credentials });
}

/** Follows the link in the latest verification email sent to `email`. */
export async function verifyEmail(app: FastifyInstance, outbox: MemoryMailer, email: string) {
  const link = linkIn(outbox.latestTo(email));
  return send(app, 'GET', pathOf(link));
}

export function verificationToken(outbox: MemoryMailer, email: string): string {
  return tokenIn(linkIn(outbox.latestTo(email)));
}

/** Signs up, verifies the email and signs in. Throws if any step fails. */
export async function createVerifiedUser(
  app: FastifyInstance,
  outbox: MemoryMailer,
  name: string,
): Promise<TestUser> {
  const user = newUser(name);
  const signUpRes = await signUp(app, user);
  if (signUpRes.statusCode !== 200) {
    throw new Error(`sign-up failed: ${signUpRes.statusCode} ${signUpRes.body}`);
  }
  const verifyRes = await verifyEmail(app, outbox, user.email);
  if (verifyRes.statusCode >= 400) {
    throw new Error(`verify failed: ${verifyRes.statusCode} ${verifyRes.body}`);
  }
  const signInRes = await signIn(app, user, { ip: uniqueIp() });
  if (signInRes.statusCode !== 200) {
    throw new Error(`sign-in failed: ${signInRes.statusCode} ${signInRes.body}`);
  }
  const body = signInRes.json<{ user: { id: string } }>();
  return { ...user, id: body.user.id, cookie: cookiesFrom(signInRes) };
}
