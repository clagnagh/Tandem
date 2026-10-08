// Phase 1 acceptance criterion: "An automated test proves user A cannot
// read, change or delete any workspace, project or task of user B, and it
// covers every endpoint." Written before the code (step 3) and made to pass
// by the endpoints built in step 5.
//
// How it stays complete: the first test compares the routes the app really
// registers with the CASES table below. A new workspace route without a case
// fails the build (docs/spec/phase-1.md, question 14).
//
// Every check ends with a positive control (the owner's same request works),
// so a test cannot pass just because a route is missing.
import { randomUUID } from 'node:crypto';
import { schema } from '@tandem/db';
import type { RouteOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app.ts';
import { API, createVerifiedUser, send, type TestUser } from './support/http.ts';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RouteCase {
  method: Method;
  /** The Fastify route pattern, exactly as registered. */
  route: string;
  body?: unknown;
  /** Status the owner gets for the same request (the positive control). */
  okStatus: number;
}

const W = `${API}/workspaces/:workspaceId`;

const CASES: RouteCase[] = [
  { method: 'PATCH', route: W, body: { name: 'Renamed' }, okStatus: 200 },
  { method: 'DELETE', route: W, okStatus: 204 },
  { method: 'GET', route: `${W}/members`, okStatus: 200 },
  { method: 'POST', route: `${W}/invites`, body: { email: 'newcomer@example.com' }, okStatus: 201 },
  { method: 'GET', route: `${W}/projects`, okStatus: 200 },
  { method: 'POST', route: `${W}/projects`, body: { name: 'New project' }, okStatus: 201 },
  { method: 'PATCH', route: `${W}/projects/:projectId`, body: { name: 'Renamed' }, okStatus: 200 },
  { method: 'DELETE', route: `${W}/projects/:projectId`, okStatus: 204 },
  { method: 'GET', route: `${W}/projects/:projectId/tasks`, okStatus: 200 },
  {
    method: 'POST',
    route: `${W}/projects/:projectId/tasks`,
    body: { title: 'New task' },
    okStatus: 201,
  },
  { method: 'PATCH', route: `${W}/tasks/:taskId`, body: { title: 'Renamed' }, okStatus: 200 },
  { method: 'DELETE', route: `${W}/tasks/:taskId`, okStatus: 204 },
  { method: 'POST', route: `${W}/tasks/:taskId/move`, body: { status: 'done' }, okStatus: 200 },
];

/** API routes that are not under a workspace, and why each is safe. */
const NOT_WORKSPACE_SCOPED = new Map<string, string>([
  [`GET ${API}/workspaces`, "lists only the caller's workspaces (tested below)"],
  [`POST ${API}/workspaces`, 'creates a new workspace owned by the caller'],
  [`POST ${API}/invites/:token/accept`, 'scoped by the invite token (invite tests, step 5)'],
]);

const OWNER_ONLY = new Set([`PATCH ${W}`, `DELETE ${W}`, `POST ${W}/invites`]);

const key = (c: { method: string; route: string }) => `${c.method} ${c.route}`;

interface Fixture {
  workspaceId: string;
  projectId: string;
  taskId: string;
}

interface Ctx {
  alice: TestUser; // owner of the fixtures under attack
  bob: TestUser; // member of alice's workspaces
  carol: TestUser; // outsider, owner of the "globex" workspace
  globex: Fixture;
}

const SECRET_TITLE = 'Globex secret plan';

let t: TestApp;
const registered: { method: string; url: string }[] = [];
let ctxPromise: Promise<Ctx> | undefined;

beforeAll(async () => {
  t = await createTestApp({
    beforeReady: (app) => {
      app.addHook('onRoute', (route: RouteOptions) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const method of methods) registered.push({ method, url: route.url });
      });
    },
  });
});

afterAll(async () => {
  await t.close();
});

/**
 * Users are created once, through the real sign-up flow, on first use.
 */
function ctx(): Promise<Ctx> {
  ctxPromise ??= (async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const bob = await createVerifiedUser(t.app, t.outbox, 'Bob');
    const carol = await createVerifiedUser(t.app, t.outbox, 'Carol');
    const globex = await insertWorkspace(carol, [], SECRET_TITLE);
    return { alice, bob, carol, globex };
  })();
  return ctxPromise;
}

/** Inserts a workspace with one project and one task, straight into the database. */
async function insertWorkspace(owner: TestUser, members: TestUser[], taskTitle = 'A task') {
  const { db } = t.database;
  const workspaceId = randomUUID();
  const projectId = randomUUID();
  const taskId = randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: `${owner.name}'s workspace`,
    slug: `ws-${workspaceId}`,
    createdBy: owner.id,
  });
  await db
    .insert(schema.workspaceMembers)
    .values([
      { workspaceId, userId: owner.id, role: 'owner' as const },
      ...members.map((m) => ({ workspaceId, userId: m.id, role: 'member' as const })),
    ]);
  await db
    .insert(schema.projects)
    .values({ id: projectId, workspaceId, name: `${owner.name}'s project`, createdBy: owner.id });
  await db.insert(schema.tasks).values({
    id: taskId,
    workspaceId,
    projectId,
    title: taskTitle,
    position: 'a0',
    createdBy: owner.id,
  });
  return { workspaceId, projectId, taskId };
}

/** Every tenant-owned row, so a test can prove a request changed nothing. */
async function snapshot(): Promise<string> {
  const tables = ['workspaces', 'workspace_members', 'invites', 'projects', 'tasks'];
  const rows = await Promise.all(
    tables.map((table) =>
      t.database.pool.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY 1, 2`),
    ),
  );
  return JSON.stringify(rows.map((r) => r.rows));
}

function urlFor(route: string, target: Fixture): string {
  return route
    .replace(':workspaceId', target.workspaceId)
    .replace(':projectId', target.projectId)
    .replace(':taskId', target.taskId);
}

function attempt(c: RouteCase, user: TestUser | undefined, target: Fixture) {
  return send(t.app, c.method, urlFor(c.route, target), {
    ...(user && { cookie: user.cookie }),
    ...(c.body !== undefined && { body: c.body }),
  });
}

async function expectOwnerCanDoIt(c: RouteCase, owner: TestUser, target: Fixture) {
  const res = await attempt(c, owner, target);
  expect(res.statusCode, `positive control: ${res.body}`).toBe(c.okStatus);
}

describe('route coverage', () => {
  it('[step 5] has an isolation case for every API route, and no stale ones', () => {
    const actual = registered
      .filter((r) => r.method !== 'HEAD' && r.url.startsWith(`${API}/`))
      .filter((r) => !r.url.startsWith(`${API}/auth`))
      .map((r) => `${r.method} ${r.url}`);
    const expected = [...CASES.map(key), ...NOT_WORKSPACE_SCOPED.keys()];

    const missing = actual.filter((r) => !expected.includes(r));
    const stale = expected.filter((r) => !actual.includes(r));
    expect(missing, 'routes with no case in CASES or NOT_WORKSPACE_SCOPED').toEqual([]);
    expect(stale, 'cases for routes that are not registered').toEqual([]);
  });
});

describe.each(CASES)('$method $route', (c) => {
  const usesChildIds = c.route.includes(':projectId') || c.route.includes(':taskId');

  it('[step 5] rejects anonymous callers with 401', async () => {
    const { alice } = await ctx();
    const target = await insertWorkspace(alice, []);
    const before = await snapshot();

    const res = await attempt(c, undefined, target);
    expect(res.statusCode).toBe(401);
    expect(await snapshot()).toBe(before);

    await expectOwnerCanDoIt(c, alice, target);
  });

  it('[step 5] answers 404 to someone outside the workspace, changing nothing', async () => {
    const { alice, carol } = await ctx();
    const target = await insertWorkspace(alice, []);
    const before = await snapshot();

    const res = await attempt(c, carol, target);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
    expect(await snapshot()).toBe(before);

    await expectOwnerCanDoIt(c, alice, target);
  });

  if (usesChildIds) {
    it('[step 5] refuses project and task ids from another workspace', async () => {
      const { alice, globex } = await ctx();
      const own = await insertWorkspace(alice, []);
      // Alice's own workspace in the path, Globex's project and task ids.
      const mixed = { ...globex, workspaceId: own.workspaceId };
      const before = await snapshot();

      const res = await attempt(c, alice, mixed);
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain(SECRET_TITLE);
      expect(await snapshot()).toBe(before);

      await expectOwnerCanDoIt(c, alice, own);
    });
  }

  if (OWNER_ONLY.has(key(c))) {
    it('[step 5] is refused to members who are not owners (403)', async () => {
      const { alice, bob } = await ctx();
      const target = await insertWorkspace(alice, [bob]);
      const before = await snapshot();

      const res = await attempt(c, bob, target);
      expect(res.statusCode).toBe(403);
      expect(await snapshot()).toBe(before);

      await expectOwnerCanDoIt(c, alice, target);
    });
  }
});

describe('ids inside request bodies', () => {
  it("[step 5] will not move a task next to another workspace's task", async () => {
    const { alice, globex } = await ctx();
    const own = await insertWorkspace(alice, []);
    const before = await snapshot();

    const res = await send(t.app, 'POST', urlFor(`${W}/tasks/:taskId/move`, own), {
      cookie: alice.cookie,
      body: { status: 'done', beforeTaskId: globex.taskId },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
    expect(await snapshot()).toBe(before);

    // Positive control: the same move without the foreign id works.
    const ok = await send(t.app, 'POST', urlFor(`${W}/tasks/:taskId/move`, own), {
      cookie: alice.cookie,
      body: { status: 'done' },
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('[step 5] will not assign a task to someone outside the workspace', async () => {
    const { alice, carol } = await ctx();
    const own = await insertWorkspace(alice, []);
    const before = await snapshot();

    const res = await send(t.app, 'PATCH', urlFor(`${W}/tasks/:taskId`, own), {
      cookie: alice.cookie,
      body: { assigneeId: carol.id },
    });
    expect(res.statusCode).toBe(400);
    expect(await snapshot()).toBe(before);

    // Positive control: assigning a member (Alice herself) works.
    const ok = await send(t.app, 'PATCH', urlFor(`${W}/tasks/:taskId`, own), {
      cookie: alice.cookie,
      body: { assigneeId: alice.id },
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });
});

describe(`GET ${API}/workspaces`, () => {
  it("[step 5] lists only the caller's own workspaces", async () => {
    const { alice, carol, globex } = await ctx();
    const own = await insertWorkspace(alice, []);

    const res = await send(t.app, 'GET', `${API}/workspaces`, { cookie: alice.cookie });
    expect(res.statusCode).toBe(200);
    const ids = res.json<{ id: string }[]>().map((w) => w.id);
    expect(ids).toContain(own.workspaceId);
    expect(ids).not.toContain(globex.workspaceId);

    const carols = await send(t.app, 'GET', `${API}/workspaces`, { cookie: carol.cookie });
    expect(carols.json<{ id: string }[]>().map((w) => w.id)).not.toContain(own.workspaceId);
  });
});
