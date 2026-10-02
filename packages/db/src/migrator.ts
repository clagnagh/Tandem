// A small migration runner with rollback (docs/adr/0005).
//
// drizzle-kit writes migrations/<name>.sql; we add <name>.down.sql by hand.
// Applied migrations are recorded in schema_migrations. Each migration runs in
// its own transaction, and an advisory lock stops two runners racing.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

// Any fixed number works; it only has to be the same for every runner.
const LOCK_ID = 7_331_001;

export interface Migration {
  name: string;
  upFile: string;
  downFile: string;
}

export async function listMigrations(dir = MIGRATIONS_DIR): Promise<Migration[]> {
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort()
    .map((f) => {
      const name = f.slice(0, -'.sql'.length);
      return { name, upFile: `${dir}${f}`, downFile: `${dir}${name}.down.sql` };
    });
}

async function withLock<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    return await fn(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    client.release();
  }
}

async function applied(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY name',
  );
  return result.rows.map((row) => row.name);
}

async function runInTransaction(client: PoolClient, fn: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await fn();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Applies every pending migration in order. Returns the names applied. */
export async function migrateUp(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  return withLock(pool, async (client) => {
    const done = new Set(await applied(client));
    const ran: string[] = [];
    for (const migration of await listMigrations(dir)) {
      if (done.has(migration.name)) continue;
      const sql = await readFile(migration.upFile, 'utf8');
      await runInTransaction(client, async () => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
      });
      ran.push(migration.name);
    }
    return ran;
  });
}

/** Rolls back the latest `steps` migrations (all of them with Infinity). */
export async function migrateDown(pool: Pool, steps = 1, dir = MIGRATIONS_DIR): Promise<string[]> {
  return withLock(pool, async (client) => {
    const byName = new Map((await listMigrations(dir)).map((m) => [m.name, m]));
    const toUndo = (await applied(client)).reverse().slice(0, steps);
    const ran: string[] = [];
    for (const name of toUndo) {
      const migration = byName.get(name);
      if (!migration) throw new Error(`Applied migration ${name} has no file in ${dir}`);
      const sql = await readFile(migration.downFile, 'utf8');
      await runInTransaction(client, async () => {
        await client.query(sql);
        await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
      });
      ran.push(name);
    }
    return ran;
  });
}
