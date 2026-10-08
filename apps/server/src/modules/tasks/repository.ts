import { schema, type Executor } from '@tandem/db';
import type { TaskStatus } from '@tandem/shared';
import { and, asc, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';

const { tasks } = schema;

const columns = {
  id: tasks.id,
  projectId: tasks.projectId,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  assigneeId: tasks.assigneeId,
  dueDate: tasks.dueDate,
  position: tasks.position,
  createdBy: tasks.createdBy,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

export type TaskRow = Awaited<ReturnType<typeof listForProject>>[number];

/** A project's board: columns in status order, each by position (ties by id). */
export function listForProject(db: Executor, workspaceId: string, projectId: string) {
  return db
    .select(columns)
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.projectId, projectId)))
    .orderBy(asc(tasks.status), asc(tasks.position), asc(tasks.id));
}

export async function find(db: Executor, workspaceId: string, taskId: string) {
  const [row] = await db
    .select(columns)
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)));
  return row;
}

interface Column {
  workspaceId: string;
  projectId: string;
  status: TaskStatus;
  /** Leave this task out (the one being moved). */
  excludeTaskId?: string;
}

function inColumn(c: Column) {
  return and(
    eq(tasks.workspaceId, c.workspaceId),
    eq(tasks.projectId, c.projectId),
    eq(tasks.status, c.status),
    c.excludeTaskId ? ne(tasks.id, c.excludeTaskId) : undefined,
  );
}

/** The highest position in a column, or null if it is empty. */
export async function lastPosition(db: Executor, c: Column): Promise<string | null> {
  const [row] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(inColumn(c))
    .orderBy(desc(tasks.position))
    .limit(1);
  return row?.position ?? null;
}

/** The first position after `position` in a column, or null. */
export async function positionAfter(db: Executor, c: Column, position: string) {
  const [row] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(and(inColumn(c), gt(tasks.position, position)))
    .orderBy(asc(tasks.position))
    .limit(1);
  return row?.position ?? null;
}

/** The last position before `position` in a column, or null. */
export async function positionBefore(db: Executor, c: Column, position: string) {
  const [row] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(and(inColumn(c), lt(tasks.position, position)))
    .orderBy(desc(tasks.position))
    .limit(1);
  return row?.position ?? null;
}

export async function insert(
  db: Executor,
  values: {
    workspaceId: string;
    projectId: string;
    title: string;
    description: string;
    status: TaskStatus;
    assigneeId: string | null;
    dueDate: string | null;
    position: string;
    createdBy: string;
  },
) {
  const [row] = await db.insert(tasks).values(values).returning(columns);
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function update(
  db: Executor,
  workspaceId: string,
  taskId: string,
  values: Partial<{
    title: string;
    description: string;
    assigneeId: string | null;
    dueDate: string | null;
    status: TaskStatus;
    position: string;
  }>,
) {
  const [row] = await db
    .update(tasks)
    .set({ ...values, updatedAt: sql`now()` })
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)))
    .returning(columns);
  return row;
}

export async function remove(db: Executor, workspaceId: string, taskId: string) {
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)))
    .returning({ id: tasks.id });
  return rows.length > 0;
}
