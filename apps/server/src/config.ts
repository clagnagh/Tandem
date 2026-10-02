import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.url(),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

/** Reads and validates configuration from the environment. Fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
