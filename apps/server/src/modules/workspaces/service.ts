// Workspace rules: membership, owner-only actions, invites. Authorization is
// enforced here, not only in routes (review checklist). Other modules use
// requireMember and isMember instead of reading membership tables.
import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '@tandem/db';
import { INVITE_TTL_DAYS, type WorkspaceRole } from '@tandem/shared';
import type { FastifyBaseLogger } from 'fastify';
import { ConflictError, ForbiddenError, GoneError, NotFoundError } from '../../errors.ts';
import type { Mailer } from '../../mail/mailer.ts';
import { sendInBackground } from '../../mail/send-in-background.ts';
import { inviteEmail } from '../../mail/templates.ts';
import type { SessionUser } from '../../plugins/session.ts';
import * as repo from './repository.ts';

export interface WorkspaceServiceDeps {
  db: Database;
  mailer: Mailer;
  logger: FastifyBaseLogger;
  appUrl: string;
}

const UNIQUE_VIOLATION = '23505';
const MAX_SLUG_LENGTH = 60;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  return slug || 'workspace';
}

/** `base`, or `base-N` with the smallest free N (starting at 2). */
export function nextFreeSlug(base: string, taken: string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  // drizzle wraps driver errors; the pg error is the cause.
  const pgError = 'cause' in err && typeof err.cause === 'object' ? err.cause : err;
  return (
    typeof pgError === 'object' &&
    pgError !== null &&
    'code' in pgError &&
    pgError.code === UNIQUE_VIOLATION &&
    'constraint' in pgError &&
    pgError.constraint === constraint
  );
}

export function createWorkspaceService(deps: WorkspaceServiceDeps) {
  const { db } = deps;

  /**
   * The caller's membership, or 404. Outsiders get "not found" rather than
   * "forbidden" so they cannot tell which workspace ids exist.
   */
  async function requireMember(userId: string, workspaceId: string): Promise<repo.WorkspaceRow> {
    const membership = await repo.findMembership(db, workspaceId, userId);
    if (!membership) throw new NotFoundError();
    return membership;
  }

  async function requireOwner(userId: string, workspaceId: string): Promise<repo.WorkspaceRow> {
    const membership = await requireMember(userId, workspaceId);
    if (membership.role !== 'owner') {
      throw new ForbiddenError('Only the workspace owner can do this');
    }
    return membership;
  }

  return {
    requireMember,

    async isMember(workspaceId: string, userId: string): Promise<boolean> {
      return (await repo.findMembership(db, workspaceId, userId)) !== undefined;
    },

    list(user: SessionUser) {
      return repo.listForUser(db, user.id);
    },

    async members(user: SessionUser, workspaceId: string) {
      await requireMember(user.id, workspaceId);
      return repo.listMembers(db, workspaceId);
    },

    async create(user: SessionUser, name: string): Promise<repo.WorkspaceRow> {
      const base = slugify(name);
      // Two people creating "Acme" at once can pick the same free slug; the
      // unique constraint catches it and we try the next one.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await db.transaction(async (tx) => {
            const slug = nextFreeSlug(base, await repo.slugsLike(tx, base));
            const ws = await repo.insertWorkspace(tx, { name, slug, createdBy: user.id });
            await repo.addMember(tx, ws.id, user.id, 'owner');
            return { ...ws, role: 'owner' as const };
          });
        } catch (err) {
          if (!isUniqueViolation(err, 'workspaces_slug_unique')) throw err;
        }
      }
      throw new ConflictError('Could not pick a unique slug; try again', 'slug_taken');
    },

    async rename(user: SessionUser, workspaceId: string, name: string) {
      const ws = await requireOwner(user.id, workspaceId);
      await repo.rename(db, workspaceId, name);
      return { ...ws, name };
    },

    async remove(user: SessionUser, workspaceId: string): Promise<void> {
      await requireOwner(user.id, workspaceId);
      await repo.remove(db, workspaceId);
    },

    async invite(user: SessionUser, workspaceId: string, email: string) {
      const ws = await requireOwner(user.id, workspaceId);
      if (await repo.isMemberByEmail(db, workspaceId, email)) {
        throw new ConflictError('That person is already a member', 'already_member');
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      let created;
      try {
        created = await db.transaction(async (tx) => {
          // A new invite replaces any open one to the same email (question 6).
          await repo.revokeOpenInvites(tx, workspaceId, email);
          return repo.insertInvite(tx, {
            workspaceId,
            email,
            tokenHash: hashToken(token),
            invitedBy: user.id,
            expiresAt,
          });
        });
      } catch (err) {
        if (!isUniqueViolation(err, 'invites_one_open_per_email')) throw err;
        throw new ConflictError('An invite to that email is being sent; try again', 'invite_busy');
      }
      sendInBackground(
        deps.mailer,
        deps.logger,
        inviteEmail({
          to: email,
          workspaceName: ws.name,
          inviterName: user.name,
          url: `${new URL(deps.appUrl).origin}/invites/${token}`,
        }),
      );
      return {
        id: created.id,
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt,
      };
    },

    async acceptInvite(
      user: SessionUser,
      token: string,
    ): Promise<{ workspaceId: string; role: WorkspaceRole }> {
      return db.transaction(async (tx) => {
        const invite = await repo.lockInviteByTokenHash(tx, hashToken(token));
        if (!invite) throw new NotFoundError('Invite not found', 'invite_not_found');
        if (invite.acceptedAt)
          throw new GoneError('This invite has already been used', 'invite_used');
        if (invite.revokedAt)
          throw new GoneError('This invite was replaced by a newer one', 'invite_revoked');
        if (invite.expired) throw new GoneError('This invite has expired', 'invite_expired');
        if (invite.email !== user.email) {
          throw new ForbiddenError(
            'This invite was sent to a different email address',
            'invite_wrong_email',
          );
        }
        // Already a member (e.g. joined another way): keep their role.
        await repo.addMember(tx, invite.workspaceId, user.id, invite.role);
        await repo.markInviteAccepted(tx, invite.workspaceId, invite.id, user.id);
        const membership = await repo.findMembership(tx, invite.workspaceId, user.id);
        return { workspaceId: invite.workspaceId, role: membership?.role ?? invite.role };
      });
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
