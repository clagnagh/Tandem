import { schema, type Executor } from '@tandem/db';
import { and, eq } from 'drizzle-orm';

const { projects } = schema;

const columns = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

export type ProjectRow = Awaited<ReturnType<typeof list>>[number];

export function list(db: Executor, workspaceId: string) {
  return db
    .select(columns)
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(projects.createdAt, projects.id);
}

export async function find(db: Executor, workspaceId: string, projectId: string) {
  const [row] = await db
    .select(columns)
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)));
  return row;
}

/**
 * Locks the project row until the transaction ends. Every change to task
 * positions in a project takes this lock first, so position changes in one
 * project happen one at a time (docs/adr/0006).
 */
export async function lock(db: Executor, workspaceId: string, projectId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .for('update');
  return row !== undefined;
}

export async function insert(
  db: Executor,
  values: { workspaceId: string; name: string; createdBy: string },
) {
  const [row] = await db.insert(projects).values(values).returning(columns);
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function rename(db: Executor, workspaceId: string, projectId: string, name: string) {
  const [row] = await db
    .update(projects)
    .set({ name })
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .returning(columns);
  return row;
}

/** Deletes the project and (by cascade) its tasks. Returns whether it existed. */
export async function remove(db: Executor, workspaceId: string, projectId: string) {
  const rows = await db
    .delete(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)))
    .returning({ id: projects.id });
  return rows.length > 0;
}
