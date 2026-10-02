import { defineConfig } from 'vitest/config';

// Two projects: fast unit tests (`pnpm test`) and integration tests that need
// a real Postgres (`pnpm test:integration`, files named *.int.test.ts).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{apps,packages}/*/tests/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['{apps,packages}/*/tests/**/*.int.test.ts'],
          // Containers can take a while to start the first time.
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
