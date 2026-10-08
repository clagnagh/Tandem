// Board state for the UI, kept free of React so it can be unit tested.
import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@tandem/shared';

export type Columns = Record<TaskStatus, TaskDto[]>;

/** Groups tasks into columns, each ordered by position (ties by id, like the API). */
export function toColumns(tasks: TaskDto[]): Columns {
  const columns: Columns = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) columns[task.status].push(task);
  for (const status of TASK_STATUSES) {
    // Byte order, matching the database's COLLATE "C" (docs/adr/0006).
    columns[status].sort((a, b) =>
      a.position === b.position ? (a.id < b.id ? -1 : 1) : a.position < b.position ? -1 : 1,
    );
  }
  return columns;
}

export function findTask(columns: Columns, taskId: string) {
  for (const status of TASK_STATUSES) {
    const index = columns[status].findIndex((t) => t.id === taskId);
    if (index !== -1) return { status, index };
  }
  return undefined;
}

export interface MoveRequest {
  status: TaskStatus;
  beforeTaskId?: string;
  afterTaskId?: string;
}

/**
 * Moves a task to `toIndex` in the `toStatus` column (an index in that column
 * without the task) and returns the new columns plus the request the API
 * needs: the neighbours directly above (before) and below (after) it.
 * Returns undefined if the task is unknown or would not move.
 */
export function moveTask(
  columns: Columns,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): { columns: Columns; request: MoveRequest } | undefined {
  const from = findTask(columns, taskId);
  if (!from) return undefined;
  const task = columns[from.status][from.index];
  if (!task) return undefined;

  const next: Columns = {
    todo: [...columns.todo],
    in_progress: [...columns.in_progress],
    done: [...columns.done],
  };
  next[from.status].splice(from.index, 1);
  const target = next[toStatus];
  const index = Math.max(0, Math.min(toIndex, target.length));
  if (from.status === toStatus && index === from.index) return undefined;
  target.splice(index, 0, { ...task, status: toStatus });

  const before = target[index - 1];
  const after = target[index + 1];
  return {
    columns: next,
    request: {
      status: toStatus,
      ...(before && { beforeTaskId: before.id }),
      ...(after && { afterTaskId: after.id }),
    },
  };
}

/**
 * Puts the server's copy of a task (new position, edited fields) on the
 * board. A task already in the right column keeps its place on screen; any
 * other (a new task, or one the server put elsewhere) is placed by position.
 */
export function replaceTask(columns: Columns, task: TaskDto): Columns {
  const found = findTask(columns, task.id);
  if (found?.status === task.status) {
    return {
      ...columns,
      [task.status]: columns[task.status].map((t) => (t.id === task.id ? task : t)),
    };
  }
  const others = TASK_STATUSES.flatMap((s) => columns[s]).filter((t) => t.id !== task.id);
  return toColumns([...others, task]);
}

/** The board without a task. */
export function removeTask(columns: Columns, taskId: string): Columns {
  return {
    todo: columns.todo.filter((t) => t.id !== taskId),
    in_progress: columns.in_progress.filter((t) => t.id !== taskId),
    done: columns.done.filter((t) => t.id !== taskId),
  };
}
