import { existsSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/client.ts';
import { listMigrations, migrateDown, migrateUp } from '../src/migrator.ts';
import { SEED, seed } from '../src/seed.ts';
import { createTestDatabase, type TestDatabase } from '../src/testing.ts';

async function tableNames(pool: pg.Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
     ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

describe('migrations', () => {
  let testDb: TestDatabase;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    testDb = await createTestDatabase({ migrate: false });
    handle = createDatabase(testDb.url, { max: 2 });
  });

  afterAll(async () => {
    await handle.close();
    await testDb.cleanup();
  });

  it('has a down file for every migration', async () => {
    for (const migration of await listMigrations()) {
      expect(existsSync(migration.downFile), `${migration.name}.down.sql is missing`).toBe(true);
    }
  });

  it('runs up, down and up again cleanly with seed data present', async () => {
    const all = (await listMigrations()).map((m) => m.name);

    expect(await migrateUp(handle.pool)).toEqual(all);
    expect(await migrateUp(handle.pool)).toEqual([]); // already applied: no-op
    await seed(handle.db);
    await seed(handle.db); // seed is idempotent
    const tables = await tableNames(handle.pool);
    expect(tables).toContain('tasks');

    expect(await migrateDown(handle.pool, Infinity)).toEqual([...all].reverse());
    expect(await tableNames(handle.pool)).toEqual([]);

    expect(await migrateUp(handle.pool)).toEqual(all);
    expect(await tableNames(handle.pool)).toEqual(tables);
  });
});

describe('schema constraints', () => {
  let testDb: TestDatabase;
  let handle: DatabaseHandle;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    handle = createDatabase(testDb.url, { max: 2 });
    await seed(handle.db);
  });

  afterAll(async () => {
    await handle.close();
    await testDb.cleanup();
  });

  it('sorts position keys byte by byte, whatever the database locale', async () => {
    // fractional-indexing keys use digits, upper and lower case letters.
    // In byte order "A" < "Z" < "a" < "a0" < "a0V"; a locale collation
    // would put "a0" before "Z".
    const keys = ['a0V', 'Zz', 'a0', 'A1', 'a'];
    const result = await handle.pool.query<{ k: string }>(
      `SELECT k FROM unnest($1::text[]) AS k ORDER BY k COLLATE "C"`,
      [keys],
    );
    const columnCollation = await handle.pool.query<{ collation_name: string }>(
      `SELECT collation_name FROM information_schema.columns
       WHERE table_name = 'tasks' AND column_name = 'position'`,
    );
    expect(columnCollation.rows[0]?.collation_name).toBe('C');
    expect(result.rows.map((row) => row.k)).toEqual(['A1', 'Zz', 'a', 'a0', 'a0V']);
  });

  it('rejects a task whose project belongs to another workspace', async () => {
    const insert = handle.pool.query(
      `INSERT INTO tasks (workspace_id, project_id, title, position, created_by)
       VALUES ($1, $2, 'Sneaky', 'a5', $3)`,
      [SEED.workspaces.acme.id, SEED.projects.roadmap.id, SEED.users.alice.id],
    );
    await expect(insert).rejects.toThrow(/tasks_project_fk/);
  });

  it('allows only one open invite per email per workspace', async () => {
    const invite = (hash: string) =>
      handle.pool.query(
        `INSERT INTO invites (workspace_id, email, token_hash, invited_by, expires_at)
         VALUES ($1, 'dana@example.com', $2, $3, now() + interval '7 days')`,
        [SEED.workspaces.acme.id, hash, SEED.users.alice.id],
      );
    await invite('hash-1');
    await expect(invite('hash-2')).rejects.toThrow(/invites_one_open_per_email/);
  });

  it('enforces field length limits in the database too', async () => {
    const insert = handle.pool.query(
      `INSERT INTO tasks (workspace_id, project_id, title, position, created_by)
       VALUES ($1, $2, '', 'a5', $3)`,
      [SEED.workspaces.acme.id, SEED.projects.launch.id, SEED.users.alice.id],
    );
    await expect(insert).rejects.toThrow(/tasks_title_length/);
  });
});
