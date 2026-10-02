// Real Postgres for integration tests (docs/adr/0007).
//
// If TEST_DATABASE_URL points at a running server (cloud sessions, or your
// own local Postgres), each call creates a fresh, uniquely named database on
// it. Otherwise a throwaway container is started with Testcontainers, which
// needs Docker. Either way the caller gets an empty, migrated database.
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrateUp } from './migrator.ts';

export interface TestDatabase {
  url: string;
  /** Drops the database (or stops the container). */
  cleanup: () => Promise<void>;
}

const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';

export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const created = process.env.TEST_DATABASE_URL
    ? await createOnServer(process.env.TEST_DATABASE_URL)
    : await startContainer();
  if (options.migrate ?? true) {
    const pool = new pg.Pool({ connectionString: created.url, max: 1 });
    try {
      await migrateUp(pool);
    } finally {
      await pool.end();
    }
  }
  return created;
}

async function createOnServer(adminUrl: string): Promise<TestDatabase> {
  const name = `tandem_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    // The name is generated above, never user input, so interpolating is safe.
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    cleanup: async () => {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}

async function startContainer(): Promise<TestDatabase> {
  // Imported lazily so runs that use TEST_DATABASE_URL never load Docker code.
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  return {
    url: container.getConnectionUri(),
    cleanup: async () => {
      await container.stop();
    },
  };
}
