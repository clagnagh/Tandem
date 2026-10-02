// Entry point: node src/index.ts (Node runs the TypeScript directly).
import { createDatabase } from '@tandem/db';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const database = createDatabase(config.DATABASE_URL);
const app = buildApp({ logger, pingDatabase: database.ping });

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
