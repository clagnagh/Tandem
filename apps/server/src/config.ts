import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  REDIS_KEY_PREFIX: z.string().default('tandem:'),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** The origin the browser uses (docs/adr/0002). Auth and CSRF checks use it. */
  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  /** Proxies allowed to set X-Forwarded-For: the Next.js server (docs/adr/0002). */
  TRUSTED_PROXIES: z
    .string()
    .default('127.0.0.1,::1')
    .transform((list) =>
      list
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default('Tandem <no-reply@tandem.local>'),
});

export type Config = z.infer<typeof configSchema>;

/** Reads and validates configuration from the environment. Fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
