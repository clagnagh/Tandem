import type { TaskDto, TaskStatus } from '@tandem/shared';
import { describe, expect, it } from 'vitest';
import { moveTask, removeTask, replaceTask, toColumns, type Columns } from '../lib/board.ts';

let n = 0;
function task(title: string, status: TaskStatus, position: string): TaskDto {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    projectId: 'p',
    title,
    description: '',
    status,
    assigneeId: null,
    dueDate: null,
    position,
    createdBy: 'u',
    createdAt: '2026-10-08T00:00:00Z',
    updatedAt: '2026-10-08T00:00:00Z',
  };
}

const titles = (c: Columns) => ({
  todo: c.todo.map((t) => t.title),
  in_progress: c.in_progress.map((t) => t.title),
  done: c.done.map((t) => t.title),
});

function board() {
  const a = task('A', 'todo', 'a0');
  const b = task('B', 'todo', 'a1');
  const c = task('C', 'todo', 'a2');
  const d = task('D', 'done', 'a0');
  return { a, b, c, d, columns: toColumns([c, d, a, b]) };
}

describe('toColumns', () => {
  it('groups by status and sorts by position byte order', () => {
    const upper = task('Upper', 'todo', 'Zz'); // "Z" sorts before "a" in byte order
    const columns = toColumns([task('Lower', 'todo', 'a0'), upper]);
    expect(columns.todo.map((t) => t.title)).toEqual(['Upper', 'Lower']);
  });
});

describe('moveTask', () => {
  it('moves into another column between two tasks and names both neighbours', () => {
    const { a, c, d, columns } = board();
    const moved = moveTask(columns, a.id, 'done', 1);
    expect(moved && titles(moved.columns)).toEqual({
      todo: ['B', 'C'],
      in_progress: [],
      done: ['D', 'A'],
    });
    expect(moved?.request).toEqual({ status: 'done', beforeTaskId: d.id });
    expect(moved?.columns.done[1]?.status).toBe('done');

    const between = moveTask(columns, c.id, 'done', 0);
    expect(between?.request).toEqual({ status: 'done', afterTaskId: d.id });
  });

  it('reorders within a column', () => {
    const { a, b, c, columns } = board();
    const moved = moveTask(columns, c.id, 'todo', 0);
    expect(moved && titles(moved.columns).todo).toEqual(['C', 'A', 'B']);
    expect(moved?.request).toEqual({ status: 'todo', afterTaskId: a.id });

    const middle = moveTask(columns, a.id, 'todo', 1);
    expect(middle && titles(middle.columns).todo).toEqual(['B', 'A', 'C']);
    expect(middle?.request).toEqual({ status: 'todo', beforeTaskId: b.id, afterTaskId: c.id });
  });

  it('moves into an empty column with no neighbours', () => {
    const { b, columns } = board();
    expect(moveTask(columns, b.id, 'in_progress', 0)?.request).toEqual({ status: 'in_progress' });
  });

  it('returns undefined when nothing would change or the task is unknown', () => {
    const { b, columns } = board();
    expect(moveTask(columns, b.id, 'todo', 1)).toBeUndefined();
    expect(moveTask(columns, 'missing', 'todo', 0)).toBeUndefined();
  });

  it('does not change the board it was given', () => {
    const { a, columns } = board();
    const before = titles(columns);
    moveTask(columns, a.id, 'done', 0);
    expect(titles(columns)).toEqual(before);
  });
});

describe('replaceTask and removeTask', () => {
  it('keeps a task in place when only its fields change', () => {
    const { b, columns } = board();
    const next = replaceTask(columns, { ...b, title: 'B2', position: 'zz' });
    expect(titles(next).todo).toEqual(['A', 'B2', 'C']);
  });

  it('places a new task by position', () => {
    const { columns } = board();
    expect(titles(replaceTask(columns, task('New', 'done', 'b0'))).done).toEqual(['D', 'New']);
  });

  it('removes a task', () => {
    const { b, columns } = board();
    expect(titles(removeTask(columns, b.id)).todo).toEqual(['A', 'C']);
  });
});
