// Phase 1 workspace and invite behaviour (step 5). Who may do what is covered
// by isolation.int.test.ts; this file covers what the features do.
//
//  - "A user can create a workspace, invite a second user by link and see
//    them join as a member."
//  - "An invite link works exactly once and expires after 7 days."
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { createTestApp, type TestApp } from './support/app.ts';
import { API, createVerifiedUser, send, type TestUser } from './support/http.ts';
import { linkIn } from './support/mailer.ts';
import { pendingIt } from './support/pending.ts';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

interface WorkspaceBody {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'member';
}

async function createWorkspace(user: TestUser, name: string): Promise<WorkspaceBody> {
  const res = await send(t.app, 'POST', `${API}/workspaces`, {
    cookie: user.cookie,
    body: { name },
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json<WorkspaceBody>();
}

async function listWorkspaces(user: TestUser): Promise<WorkspaceBody[]> {
  const res = await send(t.app, 'GET', `${API}/workspaces`, { cookie: user.cookie });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<WorkspaceBody[]>();
}

function invite(owner: TestUser, workspaceId: string, email: string) {
  return send(t.app, 'POST', `${API}/workspaces/${workspaceId}/invites`, {
    cookie: owner.cookie,
    body: { email },
  });
}

/** The token from the latest invite email to `email`. */
function inviteToken(email: string): string {
  const link = linkIn(t.outbox.latestTo(email));
  const token = link.pathname.split('/').at(-1);
  if (!token) throw new Error(`No token in ${link.href}`);
  return token;
}

function accept(user: TestUser | undefined, token: string) {
  return send(t.app, 'POST', `${API}/invites/${token}/accept`, {
    ...(user && { cookie: user.cookie }),
  });
}

describe('workspaces', () => {
  pendingIt('[step 5] creates a workspace owned by its creator', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, '  Acme Rockets  ');

    expect(ws).toMatchObject({ name: 'Acme Rockets', slug: 'acme-rockets', role: 'owner' });
    expect(await listWorkspaces(alice)).toContainEqual(ws);
  });

  pendingIt('[step 5] gives a second workspace with the same name its own slug', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const bob = await createVerifiedUser(t.app, t.outbox, 'Bob');
    const first = await createWorkspace(alice, 'Same Name');
    const second = await createWorkspace(bob, 'Same Name');

    expect(second.slug).not.toBe(first.slug);
    expect(second.slug).toMatch(/^same-name-\d+$/);
  });

  pendingIt('[step 5] renames a workspace without changing its slug', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Old Name');

    const res = await send(t.app, 'PATCH', `${API}/workspaces/${ws.id}`, {
      cookie: alice.cookie,
      body: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: ws.id, name: 'New Name', slug: ws.slug });
  });

  pendingIt('[step 5] deletes a workspace with everything in it', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Doomed');
    const project = await send(t.app, 'POST', `${API}/workspaces/${ws.id}/projects`, {
      cookie: alice.cookie,
      body: { name: 'Doomed project' },
    });
    expect(project.statusCode).toBe(201);

    const res = await send(t.app, 'DELETE', `${API}/workspaces/${ws.id}`, {
      cookie: alice.cookie,
    });
    expect(res.statusCode).toBe(204);
    expect((await listWorkspaces(alice)).map((w) => w.id)).not.toContain(ws.id);
    const left = await t.database.pool.query('SELECT 1 FROM projects WHERE workspace_id = $1', [
      ws.id,
    ]);
    expect(left.rowCount).toBe(0);
  });

  pendingIt('[step 5] rejects unknown fields in the request body', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const res = await send(t.app, 'POST', `${API}/workspaces`, {
      cookie: alice.cookie,
      body: { name: 'Sneaky', createdBy: 'someone-else' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });
});

describe('invites', () => {
  pendingIt('[step 5] lets an invited user join as a member through the emailed link', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Inviting');
    const dana = await createVerifiedUser(t.app, t.outbox, 'Dana');

    const res = await invite(alice, ws.id, dana.email);
    expect(res.statusCode, res.body).toBe(201);
    expect(t.outbox.latestTo(dana.email).subject).toMatch(/invit/i);

    const joined = await accept(dana, inviteToken(dana.email));
    expect(joined.statusCode, joined.body).toBe(200);
    expect(joined.json()).toMatchObject({ workspaceId: ws.id, role: 'member' });
    expect(await listWorkspaces(dana)).toContainEqual(
      expect.objectContaining({ id: ws.id, role: 'member' }),
    );
  });

  pendingIt('[step 5] works exactly once', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Once');
    const dana = await createVerifiedUser(t.app, t.outbox, 'Dana');
    expect((await invite(alice, ws.id, dana.email)).statusCode).toBe(201);
    const token = inviteToken(dana.email);

    expect((await accept(dana, token)).statusCode).toBe(200);
    const again = await accept(dana, token);
    expect(again.statusCode).toBe(410);
    expect(again.json()).toMatchObject({ error: { code: 'invite_used' } });
  });

  pendingIt('[step 5] expires after 7 days', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Expiring');
    const dana = await createVerifiedUser(t.app, t.outbox, 'Dana');

    const res = await invite(alice, ws.id, dana.email);
    const expiresAt = new Date(res.json<{ expiresAt: string }>().expiresAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - (Date.now() + sevenDays))).toBeLessThan(60_000);

    // An invite whose time is up, inserted directly with a known token.
    const token = randomBytes(32).toString('base64url');
    await t.database.pool.query(
      `INSERT INTO invites (workspace_id, email, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, now() - interval '1 second')`,
      [ws.id, `late-${dana.email}`, createHash('sha256').update(token).digest('hex'), alice.id],
    );
    const late = await accept(dana, token);
    expect(late.statusCode).toBe(410);
    expect(late.json()).toMatchObject({ error: { code: 'invite_expired' } });
  });

  pendingIt('[step 5] stores only a hash of the token', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Hashed');
    const email = 'hashed-invitee@example.com';
    expect((await invite(alice, ws.id, email)).statusCode).toBe(201);
    const token = inviteToken(email);

    const rows = await t.database.pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM invites WHERE workspace_id = $1',
      [ws.id],
    );
    expect(rows.rows).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex') }]);
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });

  pendingIt('[step 5] refuses someone signed in with a different email', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Wrong person');
    const dana = await createVerifiedUser(t.app, t.outbox, 'Dana');
    const eve = await createVerifiedUser(t.app, t.outbox, 'Eve');
    expect((await invite(alice, ws.id, dana.email)).statusCode).toBe(201);
    const token = inviteToken(dana.email);

    const res = await accept(eve, token);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'invite_wrong_email' } });
    // The invite is still good for the right person.
    expect((await accept(dana, token)).statusCode).toBe(200);
  });

  pendingIt('[step 5] needs a signed-in user', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Anonymous');
    const email = 'anon-invitee@example.com';
    expect((await invite(alice, ws.id, email)).statusCode).toBe(201);
    expect((await accept(undefined, inviteToken(email))).statusCode).toBe(401);
  });

  pendingIt('[step 5] answers 404 for a token that never existed', async () => {
    const dana = await createVerifiedUser(t.app, t.outbox, 'Dana');
    const res = await accept(dana, randomBytes(32).toString('base64url'));
    expect(res.statusCode).toBe(404);
    // Not the "route_not_found" an unbuilt route would give.
    expect(res.json()).toMatchObject({ error: { code: 'invite_not_found' } });
  });

  pendingIt('[step 5] refuses to invite someone who is already a member', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Members');
    const res = await invite(alice, ws.id, alice.email);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'already_member' } });
  });

  pendingIt('[step 5] cancels the old link when the same email is invited again', async () => {
    const alice = await createVerifiedUser(t.app, t.outbox, 'Alice');
    const ws = await createWorkspace(alice, 'Reinvite');
    const dana = await createVerifiedUser(t.app, t.outbox, 'Dana');
    expect((await invite(alice, ws.id, dana.email)).statusCode).toBe(201);
    const oldToken = inviteToken(dana.email);
    expect((await invite(alice, ws.id, dana.email)).statusCode).toBe(201);
    const newToken = inviteToken(dana.email);
    expect(newToken).not.toBe(oldToken);

    expect((await accept(dana, oldToken)).statusCode).toBe(410);
    expect((await accept(dana, newToken)).statusCode).toBe(200);
  });
});
