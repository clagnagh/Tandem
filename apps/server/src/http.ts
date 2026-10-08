// Small helpers shared by the route files.
import { idSchema } from '@tandem/shared';
import { NotFoundError } from './errors.ts';

/**
 * An id from the URL. Anything that is not a UUID cannot name a row, so it
 * gets the same 404 as an id that does not exist (and never reaches
 * Postgres, which would reject it with an error).
 */
export function parseId(raw: unknown): string {
  const result = idSchema.safeParse(raw);
  if (!result.success) throw new NotFoundError();
  return result.data;
}

/** Path params as a plain record, for routes that read them by name. */
export function params(request: { params: unknown }): Record<string, unknown> {
  return typeof request.params === 'object' && request.params !== null
    ? (request.params as Record<string, unknown>)
    : {};
}
