// Usage: pnpm db:migrate         apply pending migrations
//        pnpm db:rollback        undo the latest migration
//        pnpm db:rollback -- 3   undo the latest three
import pg from 'pg';
import { migrateDown, migrateUp } from '../src/migrator.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const [direction = 'up', stepsArg] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  if (direction === 'up') {
    const ran = await migrateUp(pool);
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Nothing to apply.');
  } else if (direction === 'down') {
    const steps = stepsArg ? Number.parseInt(stepsArg, 10) : 1;
    const ran = await migrateDown(pool, steps);
    console.log(ran.length ? `Rolled back: ${ran.join(', ')}` : 'Nothing to roll back.');
  } else {
    console.error(`Unknown direction "${direction}". Use "up" or "down".`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
