// Usage: pnpm db:seed   (safe to re-run: existing rows are left alone)
import { createDatabase } from '../src/client.ts';
import { seed } from '../src/seed.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const handle = createDatabase(url, { max: 1 });
try {
  await seed(handle.db);
  console.log('Seeded 3 users, 2 workspaces, 2 projects and 6 tasks.');
} finally {
  await handle.close();
}
