// Database access for workspaces, members and invites. Every query on a
// tenant-owned table takes a workspaceId (architecture rule 2).
import { schema, type Executor } from '@tandem/db';
import type { WorkspaceRole } from '@tandem/shared';
import { and, eq, isNull, like, or, sql } from 'drizzle-orm';

const { invites, users, workspaceMembers, workspaces } = schema;

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

const workspaceWithRole = {
  id: workspaces.id,
  name: workspaces.name,
  slug: workspaces.slug,
  role: workspaceMembers.role,
};

export function listForUser(db: Executor, userId: string): Promise<WorkspaceRow[]> {
  return db
    .select(workspaceWithRole)
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt, workspaces.id);
}

export async function findMembership(
  db: Executor,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRow | undefined> {
  const [row] = await db
    .select(workspaceWithRole)
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return row;
}

export async function isMemberByEmail(
  db: Executor,
  workspaceId: string,
  email: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: users.id })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(sql`lower(${users.email})`, email)),
    );
  return row !== undefined;
}

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
}

/** Members in join order (the owner first, as they joined at creation). */
export function listMembers(db: Executor, workspaceId: string): Promise<MemberRow[]> {
  return db
    .select({
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.joinedAt, workspaceMembers.userId);
}

/** Slugs equal to `base` or of the form `base-N`. */
export async function slugsLike(db: Executor, base: string): Promise<string[]> {
  const rows = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(or(eq(workspaces.slug, base), like(workspaces.slug, `${base}-%`)));
  return rows.map((r) => r.slug);
}

export async function insertWorkspace(
  db: Executor,
  values: { name: string; slug: string; createdBy: string },
): Promise<{ id: string; name: string; slug: string }> {
  const [row] = await db
    .insert(workspaces)
    .values(values)
    .returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug });
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function addMember(
  db: Executor,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  await db.insert(workspaceMembers).values({ workspaceId, userId, role }).onConflictDoNothing();
}

export async function rename(db: Executor, workspaceId: string, name: string): Promise<void> {
  await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId));
}

/** Deletes the workspace; foreign keys cascade to members, invites, projects and tasks. */
export async function remove(db: Executor, workspaceId: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function revokeOpenInvites(
  db: Executor,
  workspaceId: string,
  email: string,
): Promise<void> {
  await db
    .update(invites)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(invites.workspaceId, workspaceId),
        eq(invites.email, email),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
      ),
    );
}

export async function insertInvite(
  db: Executor,
  values: {
    workspaceId: string;
    email: string;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
  },
) {
  const [row] = await db
    .insert(invites)
    .values({ ...values, role: 'member' })
    .returning({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
    });
  if (!row) throw new Error('insert returned no row');
  return row;
}

/**
 * Finds an invite by token hash and locks it for the rest of the
 * transaction, so two people accepting at once cannot both succeed.
 * Not scoped by workspace: the token is the credential that names it.
 */
export async function lockInviteByTokenHash(db: Executor, tokenHash: string) {
  const [row] = await db
    .select({
      id: invites.id,
      workspaceId: invites.workspaceId,
      email: invites.email,
      role: invites.role,
      acceptedAt: invites.acceptedAt,
      revokedAt: invites.revokedAt,
      expired: sql<boolean>`${invites.expiresAt} <= now()`,
    })
    .from(invites)
    .where(eq(invites.tokenHash, tokenHash))
    .for('update');
  return row;
}

export async function markInviteAccepted(
  db: Executor,
  workspaceId: string,
  inviteId: string,
  userId: string,
): Promise<void> {
  await db
    .update(invites)
    .set({ acceptedAt: sql`now()`, acceptedBy: userId })
    .where(and(eq(invites.workspaceId, workspaceId), eq(invites.id, inviteId)));
}
