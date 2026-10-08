// Better Auth configuration (docs/adr/0003). The library owns sign-up,
// sessions, verification, password reset and OAuth; this file decides how.
import { schema, type Database } from '@tandem/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { FastifyBaseLogger } from 'fastify';
import type { Email, Mailer } from '../../mail/mailer.ts';
import { sendInBackground } from '../../mail/send-in-background.ts';
import { passwordResetEmail, verificationEmail } from '../../mail/templates.ts';

export const AUTH_BASE_PATH = '/api/v1/auth';

export interface AuthOptions {
  db: Database;
  mailer: Mailer;
  logger: FastifyBaseLogger;
  appUrl: string;
  secret: string;
  github?: { clientId: string; clientSecret: string } | undefined;
}

export function createAuth(options: AuthOptions) {
  const { db, mailer, logger, appUrl, secret, github } = options;

  // Emails are sent without waiting for the SMTP server. Waiting would make
  // "reset password" slower for real accounts than for unknown emails, and
  // that timing difference would reveal which emails have accounts.
  const send = (email: Email) => {
    sendInBackground(mailer, logger, email);
    return Promise.resolve();
  };

  return betterAuth({
    appName: 'Tandem',
    // Links in emails and the OAuth callback use the browser's origin;
    // Next.js forwards /api/* to this server (docs/adr/0002).
    baseURL: appUrl,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: [new URL(appUrl).origin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => send(passwordResetEmail(user, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }) => send(verificationEmail(user, url)),
    },
    socialProviders: github ? { github } : {},
    // Login attempts are limited in Redis by our own limiter (docs/adr/0009).
    // Better Auth's limiter keeps counts in process memory, which does not
    // work across instances, and it is off in tests but on in production.
    rateLimit: { enabled: false },
    advanced: {
      useSecureCookies: true,
      cookiePrefix: 'tandem',
      // The Fastify route passes the client IP it resolved (trusting only
      // the Next.js proxy) in this header; nothing else sets it.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    logger: {
      log: (level, message) => {
        logger[level]({ component: 'better-auth' }, message);
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
