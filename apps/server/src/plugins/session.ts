// Who is calling. A preHandler hook on the protected API resolves the Better
// Auth session from the cookie, or answers 401.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors.ts';
import type { Auth } from '../modules/auth/auth.ts';
import { toHeaders } from '../modules/auth/routes.ts';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export function requireSession(app: FastifyInstance, auth: Auth): void {
  app.decorateRequest('user', null);
  app.addHook('preHandler', async (request) => {
    const session = await auth.api.getSession({ headers: toHeaders(request) });
    if (!session) throw new UnauthorizedError();
    request.user = {
      id: session.user.id,
      email: session.user.email.toLowerCase(),
      name: session.user.name,
    };
  });
}

/** The signed-in user. Only valid on routes behind requireSession. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}
