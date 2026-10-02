import { defineConfig } from 'drizzle-kit';

// drizzle-kit only generates the "up" SQL. Each migration also gets a
// hand-written <name>.down.sql, applied by scripts/migrate.ts (docs/adr/0005).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
