import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive a real browser against the real stack: the Fastify
// server, the Next.js app, Postgres, Redis and Mailpit (for email). Start the
// services first (docker compose up -d), then run `pnpm test:e2e`.
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Lets an environment with a preinstalled Chromium use it (see CLAUDE.md).
    ...(process.env.PW_CHROMIUM_PATH && {
      launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH },
    }),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --env-file-if-exists=../../.env ../server/src/index.ts',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !CI,
      stdout: 'ignore',
    },
    {
      // CI builds first and serves the production build.
      command: CI ? 'pnpm start' : 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
