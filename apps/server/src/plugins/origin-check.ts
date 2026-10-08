// CSRF defence (docs/adr/0004): every state-changing API request must come
// from the app's own origin. Browsers always send Origin on cross-site and
// on same-origin non-GET fetches, so a missing header is refused too.
import type { FastifyInstance } from 'fastify';
import { ForbiddenError } from '../errors.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function registerOriginCheck(app: FastifyInstance, appUrl: string): void {
  const allowed = new URL(appUrl).origin;
  app.addHook('onRequest', (request, _reply, done) => {
    const checked = !SAFE_METHODS.has(request.method) && request.url.startsWith('/api/');
    if (checked && request.headers.origin !== allowed) {
      done(new ForbiddenError('Cross-origin request refused'));
      return;
    }
    done();
  });
}
