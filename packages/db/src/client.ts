import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle, as passed to db.transaction(async (tx) => ...). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything queries can run on: the database or a transaction. */
export type Executor = Database | Transaction;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
  /** Resolves if the database answers a trivial query. Used by /health. */
  ping: () => Promise<void>;
  close: () => Promise<void>;
}

export function createDatabase(url: string, options: { max?: number } = {}): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    ping: async () => {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}
