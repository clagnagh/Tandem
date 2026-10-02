// Deterministic seed data: three users and two workspaces, enough to test
// tenant isolation (user A must never reach workspace B).
//
//   Acme   (owner alice, member bob)  project "Launch"  - 4 tasks
//   Globex (owner carol)              project "Roadmap" - 2 tasks
//
// Fixed ids make the seed idempotent (re-running inserts nothing new) and let
// tests refer to rows by name. The seeded users have no password yet; Phase 1
// step 4 adds credential accounts once Better Auth is wired in.
import { generateKeyBetween } from 'fractional-indexing';
import type { Database } from './client.ts';
import { projects, tasks, users, workspaceMembers, workspaces } from './schema.ts';

export const SEED = {
  users: {
    alice: { id: 'seed-user-alice', name: 'Alice Owner', email: 'alice@example.com' },
    bob: { id: 'seed-user-bob', name: 'Bob Member', email: 'bob@example.com' },
    carol: { id: 'seed-user-carol', name: 'Carol Outsider', email: 'carol@example.com' },
  },
  workspaces: {
    acme: { id: '00000000-0000-4000-8000-00000000a001', name: 'Acme', slug: 'acme' },
    globex: { id: '00000000-0000-4000-8000-00000000b001', name: 'Globex', slug: 'globex' },
  },
  projects: {
    launch: { id: '00000000-0000-4000-8000-00000000a101', name: 'Launch' },
    roadmap: { id: '00000000-0000-4000-8000-00000000b101', name: 'Roadmap' },
  },
} as const;

const taskId = (n: number) => `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`;

export async function seed(db: Database): Promise<void> {
  const { alice, bob, carol } = SEED.users;
  const { acme, globex } = SEED.workspaces;
  const { launch, roadmap } = SEED.projects;

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values([alice, bob, carol].map((u) => ({ ...u, emailVerified: true })))
      .onConflictDoNothing();

    await tx
      .insert(workspaces)
      .values([
        { ...acme, createdBy: alice.id },
        { ...globex, createdBy: carol.id },
      ])
      .onConflictDoNothing();

    await tx
      .insert(workspaceMembers)
      .values([
        { workspaceId: acme.id, userId: alice.id, role: 'owner' },
        { workspaceId: acme.id, userId: bob.id, role: 'member' },
        { workspaceId: globex.id, userId: carol.id, role: 'owner' },
      ])
      .onConflictDoNothing();

    await tx
      .insert(projects)
      .values([
        { ...launch, workspaceId: acme.id, createdBy: alice.id },
        { ...roadmap, workspaceId: globex.id, createdBy: carol.id },
      ])
      .onConflictDoNothing();

    // Position keys: each new key sorts after the previous one.
    const first = generateKeyBetween(null, null); // "a0"
    const second = generateKeyBetween(first, null); // "a1"
    const third = generateKeyBetween(second, null); // "a2"

    await tx
      .insert(tasks)
      .values([
        {
          id: taskId(1),
          workspaceId: acme.id,
          projectId: launch.id,
          title: 'Write launch checklist',
          status: 'todo',
          position: first,
          assigneeId: alice.id,
          createdBy: alice.id,
        },
        {
          id: taskId(2),
          workspaceId: acme.id,
          projectId: launch.id,
          title: 'Book demo room',
          status: 'todo',
          position: second,
          dueDate: '2026-10-31',
          createdBy: alice.id,
        },
        {
          id: taskId(3),
          workspaceId: acme.id,
          projectId: launch.id,
          title: 'Draft announcement',
          status: 'todo',
          position: third,
          assigneeId: bob.id,
          createdBy: bob.id,
        },
        {
          id: taskId(4),
          workspaceId: acme.id,
          projectId: launch.id,
          title: 'Pick launch date',
          status: 'done',
          position: first,
          createdBy: alice.id,
        },
        {
          id: taskId(5),
          workspaceId: globex.id,
          projectId: roadmap.id,
          title: 'Globex secret plan',
          description: 'Only Globex members may ever read this.',
          status: 'in_progress',
          position: first,
          createdBy: carol.id,
        },
        {
          id: taskId(6),
          workspaceId: globex.id,
          projectId: roadmap.id,
          title: 'Hire a designer',
          status: 'todo',
          position: first,
          assigneeId: carol.id,
          createdBy: carol.id,
        },
      ])
      .onConflictDoNothing();
  });
}
