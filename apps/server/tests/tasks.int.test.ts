// Phase 1 project and task behaviour (step 5). Who may do what is covered by
// isolation.int.test.ts; this file covers what the features do.
//
//  - "Tasks can be created, edited, assigned, moved between columns and
//    reordered by drag and drop; order survives a reload."
//  - "Two rapid moves of the same task never corrupt the order of other tasks."
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app.ts';
import { API, createVerifiedUser, send, type TestUser } from './support/http.ts';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  assigneeId: string | null;
  dueDate: string | null;
  position: string;
}

interface Board {
  owner: TestUser;
  member: TestUser;
  workspaceId: string;
  projectId: string;
}

/** A workspace (owner plus one member) with one project, built through the API. */
async function newBoard(): Promise<Board> {
  const owner = await createVerifiedUser(t.app, t.outbox, 'Owner');
  const member = await createVerifiedUser(t.app, t.outbox, 'Member');
  const ws = await send(t.app, 'POST', `${API}/workspaces`, {
    cookie: owner.cookie,
    body: { name: 'Board test' },
  });
  expect(ws.statusCode, ws.body).toBe(201);
  const workspaceId = ws.json<{ id: string }>().id;

  const inv = await send(t.app, 'POST', `${API}/workspaces/${workspaceId}/invites`, {
    cookie: owner.cookie,
    body: { email: member.email },
  });
  expect(inv.statusCode, inv.body).toBe(201);
  const token = /\/invites\/([\w-]+)/.exec(t.outbox.latestTo(member.email).text)?.[1] ?? '';
  const joined = await send(t.app, 'POST', `${API}/invites/${token}/accept`, {
    cookie: member.cookie,
  });
  expect(joined.statusCode, joined.body).toBe(200);

  const project = await send(t.app, 'POST', `${API}/workspaces/${workspaceId}/projects`, {
    cookie: member.cookie, // members may create projects (phase-1.md question 9)
    body: { name: 'Launch' },
  });
  expect(project.statusCode, project.body).toBe(201);
  return { owner, member, workspaceId, projectId: project.json<{ id: string }>().id };
}

function tasksUrl(b: Board) {
  return `${API}/workspaces/${b.workspaceId}/projects/${b.projectId}/tasks`;
}

function taskUrl(b: Board, taskId: string) {
  return `${API}/workspaces/${b.workspaceId}/tasks/${taskId}`;
}

async function createTask(b: Board, body: Record<string, unknown>): Promise<Task> {
  const res = await send(t.app, 'POST', tasksUrl(b), { cookie: b.member.cookie, body });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<Task>();
}

async function listTasks(b: Board): Promise<Task[]> {
  const res = await send(t.app, 'GET', tasksUrl(b), { cookie: b.member.cookie });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<Task[]>();
}

/** Task titles per column, in board order. */
async function columns(b: Board): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = { todo: [], in_progress: [], done: [] };
  for (const task of await listTasks(b)) result[task.status]?.push(task.title);
  return result;
}

function move(b: Board, taskId: string, body: Record<string, unknown>) {
  return send(t.app, 'POST', `${taskUrl(b, taskId)}/move`, { cookie: b.member.cookie, body });
}

describe('projects', () => {
  it('[step 5] lists, renames and deletes projects', async () => {
    const b = await newBoard();
    const base = `${API}/workspaces/${b.workspaceId}/projects`;

    const list = await send(t.app, 'GET', base, { cookie: b.member.cookie });
    expect(list.json()).toEqual([expect.objectContaining({ id: b.projectId, name: 'Launch' })]);

    const renamed = await send(t.app, 'PATCH', `${base}/${b.projectId}`, {
      cookie: b.member.cookie,
      body: { name: 'Relaunch' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ id: b.projectId, name: 'Relaunch' });

    await createTask(b, { title: 'Goes with the project' });
    const deleted = await send(t.app, 'DELETE', `${base}/${b.projectId}`, {
      cookie: b.member.cookie,
    });
    expect(deleted.statusCode).toBe(204);
    expect((await send(t.app, 'GET', base, { cookie: b.member.cookie })).json()).toEqual([]);
  });
});

describe('tasks', () => {
  it('[step 5] creates tasks with defaults, appending each to its column', async () => {
    const b = await newBoard();
    const first = await createTask(b, { title: 'First' });
    expect(first).toMatchObject({
      title: 'First',
      description: '',
      status: 'todo',
      assigneeId: null,
      dueDate: null,
    });
    await createTask(b, { title: 'Second' });
    await createTask(b, { title: 'Shipped', status: 'done' });
    await createTask(b, { title: 'Third' });

    expect(await columns(b)).toEqual({
      todo: ['First', 'Second', 'Third'],
      in_progress: [],
      done: ['Shipped'],
    });
  });

  it('[step 5] edits, assigns and unassigns a task', async () => {
    const b = await newBoard();
    const task = await createTask(b, { title: 'Draft' });

    const res = await send(t.app, 'PATCH', taskUrl(b, task.id), {
      cookie: b.member.cookie,
      body: {
        title: 'Final',
        description: 'Plain text only',
        dueDate: '2026-12-01',
        assigneeId: b.owner.id,
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      title: 'Final',
      description: 'Plain text only',
      dueDate: '2026-12-01',
      assigneeId: b.owner.id,
    });

    const cleared = await send(t.app, 'PATCH', taskUrl(b, task.id), {
      cookie: b.member.cookie,
      body: { assigneeId: null, dueDate: null },
    });
    expect(cleared.json()).toMatchObject({ assigneeId: null, dueDate: null, title: 'Final' });
  });

  it('[step 5] gives tasks created at the same moment distinct positions', async () => {
    // Without the project lock, simultaneous creates all read the same
    // "last position" and get the same key, so their order is undefined.
    const b = await newBoard();
    const titles = Array.from({ length: 8 }, (_, i) => `Parallel ${i}`);
    await Promise.all(titles.map((title) => createTask(b, { title })));

    const tasks = await listTasks(b);
    expect(tasks.map((task) => task.title).sort()).toEqual([...titles].sort());
    expect(new Set(tasks.map((task) => task.position)).size).toBe(titles.length);
  });

  it('[step 5] deletes a task', async () => {
    const b = await newBoard();
    const task = await createTask(b, { title: 'Temporary' });
    const res = await send(t.app, 'DELETE', taskUrl(b, task.id), { cookie: b.member.cookie });
    expect(res.statusCode).toBe(204);
    expect(await listTasks(b)).toEqual([]);
  });
});

describe('moving tasks', () => {
  async function boardWithTodos(titles: string[]) {
    const b = await newBoard();
    const tasks: Record<string, Task> = {};
    for (const title of titles) tasks[title] = await createTask(b, { title });
    const id = (title: string) => {
      const task = tasks[title];
      if (!task) throw new Error(`no task ${title}`);
      return task.id;
    };
    return { b, id };
  }

  it('[step 5] moves a task between columns and reorders within one', async () => {
    const { b, id } = await boardWithTodos(['A', 'B', 'C', 'D']);

    // Into an empty column.
    expect((await move(b, id('B'), { status: 'done' })).statusCode).toBe(200);
    // To the top of a column: only a neighbour below it.
    expect((await move(b, id('D'), { status: 'todo', afterTaskId: id('A') })).statusCode).toBe(200);
    // Between two tasks.
    expect((await move(b, id('A'), { status: 'done', beforeTaskId: id('B') })).statusCode).toBe(
      200,
    );
    expect(
      (await move(b, id('C'), { status: 'done', beforeTaskId: id('B'), afterTaskId: id('A') }))
        .statusCode,
    ).toBe(200);

    // A fresh read (as after a page reload) shows the same order.
    expect(await columns(b)).toEqual({ todo: ['D'], in_progress: [], done: ['B', 'C', 'A'] });
  });

  it('[step 5] keeps every other task in place when one task is moved twice at once', async () => {
    const { b, id } = await boardWithTodos(['A', 'B', 'C', 'D', 'E']);

    // Two rapid moves of C, sent together: one to the top, one to the bottom.
    const [first, second] = await Promise.all([
      move(b, id('C'), { status: 'todo', afterTaskId: id('A') }),
      move(b, id('C'), { status: 'todo', beforeTaskId: id('E') }),
    ]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);

    const order = (await columns(b)).todo ?? [];
    expect(order.filter((title) => title !== 'C')).toEqual(['A', 'B', 'D', 'E']);
    expect([...order].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    const positions = (await listTasks(b)).map((task) => task.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('[step 5] refuses neighbours that are in the wrong order (stale board)', async () => {
    const { b, id } = await boardWithTodos(['A', 'B', 'C']);
    const res = await move(b, id('C'), {
      status: 'todo',
      beforeTaskId: id('B'),
      afterTaskId: id('A'),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'stale_board' } });
    expect((await columns(b)).todo).toEqual(['A', 'B', 'C']);
  });

  it('[step 5] refuses a neighbour from another column', async () => {
    const { b, id } = await boardWithTodos(['A', 'B']);
    const res = await move(b, id('A'), { status: 'done', beforeTaskId: id('B') });
    expect(res.statusCode).toBe(400);
    expect((await columns(b)).todo).toEqual(['A', 'B']);
  });
});
