// Entry point: node src/index.ts (Node runs the TypeScript directly).
import { createDatabase } from '@tandem/db';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createSmtpMailer } from './mail/smtp-mailer.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const database = createDatabase(config.DATABASE_URL);
const github =
  config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
    ? { clientId: config.GITHUB_CLIENT_ID, clientSecret: config.GITHUB_CLIENT_SECRET }
    : undefined;
const app = buildApp({
  logger,
  database,
  redis: { url: config.REDIS_URL, keyPrefix: config.REDIS_KEY_PREFIX },
  mailer: createSmtpMailer({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    from: config.MAIL_FROM,
  }),
  auth: { appUrl: config.APP_URL, secret: config.BETTER_AUTH_SECRET, ...(github && { github }) },
  trustedProxies: config.TRUSTED_PROXIES,
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await app.close(); // stops accepting requests, waits for in-flight ones
  await database.close();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdown(signal).then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error({ err }, 'shutdown failed');
        process.exit(1);
      },
    );
  });
}

await app.listen({ port: config.SERVER_PORT, host: '0.0.0.0' });
