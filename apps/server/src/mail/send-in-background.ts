import type { FastifyBaseLogger } from 'fastify';
import type { Email, Mailer } from './mailer.ts';

/**
 * Sends without making the request wait for the SMTP server. Failures are
 * logged (subject only; bodies hold secret links) instead of failing the
 * request: the user can ask for the email again.
 */
export function sendInBackground(mailer: Mailer, logger: FastifyBaseLogger, email: Email): void {
  mailer.send(email).catch((err: unknown) => {
    logger.error({ err, subject: email.subject }, 'failed to send email');
  });
}
