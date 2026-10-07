import type { FastifyBaseLogger } from 'fastify';
import type { Mailer } from './mailer.ts';

/**
 * Placeholder until Phase 1 step 4 adds SMTP delivery to Mailpit. Logs who
 * an email is for and its subject, never its body: bodies hold sign-in and
 * reset links, which are secrets.
 */
export function createLogMailer(logger: FastifyBaseLogger): Mailer {
  return {
    send: (email) => {
      logger.info({ to: email.to, subject: email.subject }, 'email not sent (no SMTP yet)');
      return Promise.resolve();
    },
  };
}
