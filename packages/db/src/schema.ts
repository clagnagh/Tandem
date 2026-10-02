// Drizzle schema for Phase 1.
//
// The first four tables belong to Better Auth (docs/adr/0003). Their shape
// follows the library's core schema; the TypeScript keys must keep the names
// Better Auth expects (emailVerified, userId, ...). The column names are
// snake_case like the rest of the database.
//
// Every tenant-owned table has workspace_id (architecture rule 2).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { LIMITS, TASK_STATUSES, WORKSPACE_ROLES } from '@tandem/shared';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/**
 * Fractional-index position keys must sort byte by byte ("a0" < "a0V" < "a1").
 * Locale collations such as en_US ignore case and punctuation and would
 * misorder them, so the column uses the "C" collation (docs/adr/0006).
 */
const positionKey = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
});

// ---------------------------------------------------------------------------
// Auth (Better Auth). User ids are text because Better Auth generates them.
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    // Password hash for email sign-in. Never logged or returned by the API.
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const workspaceRole = pgEnum('workspace_role', WORKSPACE_ROLES);
export const taskStatus = pgEnum('task_status', TASK_STATUSES);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('workspaces_created_by_idx').on(t.createdBy),
    check(
      'workspaces_name_length',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(LIMITS.workspaceName))}`,
    ),
  ],
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // The primary key already indexes workspace_id first; this covers
    // "which workspaces is this user in?".
    index('workspace_members_user_id_idx').on(t.userId),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Stored lower-cased; the accepting user's email must match (question 6).
    email: text('email').notNull(),
    role: workspaceRole('role').notNull().default('member'),
    // SHA-256 of the token in the link. The token itself is never stored.
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: text('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    // Set when a newer invite to the same email replaces this one.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('invites_workspace_id_idx').on(t.workspaceId),
    index('invites_invited_by_idx').on(t.invitedBy),
    index('invites_accepted_by_idx').on(t.acceptedBy),
    // At most one open invite per email per workspace.
    uniqueIndex('invites_one_open_per_email')
      .on(t.workspaceId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    check('invites_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

// ---------------------------------------------------------------------------
// Projects and tasks
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Also serves as the workspace_id index (it leads with workspace_id) and is
    // the target of the tasks (workspace_id, project_id) foreign key below.
    unique('projects_workspace_id_id_key').on(t.workspaceId, t.id),
    index('projects_created_by_idx').on(t.createdBy),
    check(
      'projects_name_length',
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(LIMITS.projectName))}`,
    ),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: taskStatus('status').notNull().default('todo'),
    // Must be a workspace member; the service checks this (question 10).
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date', { mode: 'string' }),
    position: positionKey('position').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // A task's project must be in the same workspace as the task. The
    // database enforces it, so a bug in a service cannot mix tenants here.
    foreignKey({
      name: 'tasks_project_fk',
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete('cascade'),
    // Board load: one project's tasks, grouped by column, in order. It leads
    // with (workspace_id, project_id), so it also indexes both foreign keys.
    index('tasks_board_idx').on(t.workspaceId, t.projectId, t.status, t.position),
    index('tasks_assignee_id_idx').on(t.assigneeId),
    index('tasks_created_by_idx').on(t.createdBy),
    check(
      'tasks_title_length',
      sql`char_length(${t.title}) between 1 and ${sql.raw(String(LIMITS.taskTitle))}`,
    ),
    check(
      'tasks_description_length',
      sql`char_length(${t.description}) <= ${sql.raw(String(LIMITS.taskDescription))}`,
    ),
  ],
);
