# 4. Phase 1: Foundation

Phase 1 delivers a deployed app where a user signs up, creates a workspace, invites teammates and manages tasks on a kanban board, with CI and tests guarding every change. The goal is a solid base: get auth, tenant isolation and the testing habit right now, because every later phase builds on them.

### Concepts

Authentication and sessions, multi-tenancy, relational modeling, migrations, the testing pyramid, CI/CD, environment configuration.

### Scope

- **Scaffold:** pnpm monorepo, strict TypeScript, eslint, prettier, Docker Compose for Postgres, Redis and a local mail catcher (Mailpit), GitHub Actions CI.
- **Auth:** email and password sign-up, login, logout, email verification and password reset (emails land in the mail catcher locally), plus GitHub OAuth. Use a maintained library; sessions are httpOnly, Secure, SameSite=Lax cookies.
- **Workspaces:** create, rename and delete a workspace; invite people by emailed single-use link; two roles for now (owner, member). Full RBAC arrives in Phase 4.
- **Projects and tasks:** a workspace has projects; a project is a kanban board. A task has a title, plain-text description, status (todo, in progress, done), assignee, due date and position. Drag-and-drop reordering with optimistic UI updates.
- **Plumbing:** `/health` endpoint, structured logging with request IDs, a central error handler, and a staging deploy from `main`.

### Data model

| Table | Key columns |
| --- | --- |
| users | id, email (unique), name, email\_verified\_at, created\_at (plus whatever the auth library requires) |
| workspaces | id, name, slug (unique), created\_by, created\_at |
| workspace\_members | workspace\_id, user\_id, role (owner or member), joined\_at; primary key (workspace\_id, user\_id) |
| invites | id, workspace\_id, email, role, token\_hash, expires\_at, accepted\_at |
| projects | id, workspace\_id, name, created\_at |
| tasks | id, workspace\_id, project\_id, title, description, status, assignee\_id, due\_date, position, created\_by, created\_at, updated\_at |

Index every foreign key and add a composite index on `(workspace_id, project_id, status, position)` for board loads. Use a string-based fractional index for `position` so a move updates one row.

### Interfaces

All routes live under `/api/v1` and carry the workspace ID in the path so tenant scoping is always visible.

| Method and path | Purpose |
| --- | --- |
| `/auth/*` | Sign-up, login, logout, verify, reset, OAuth (handled by the auth library) |
| `GET, POST /workspaces` | List the caller's workspaces; create one |
| `PATCH, DELETE /workspaces/:workspaceId` | Rename or delete (owner only) |
| `POST /workspaces/:workspaceId/invites` | Create an invite (owner only) |
| `POST /invites/:token/accept` | Join a workspace from an invite |
| `GET, POST /workspaces/:workspaceId/projects` | List and create projects |
| `GET, POST /workspaces/:workspaceId/projects/:projectId/tasks` | List and create tasks |
| `PATCH, DELETE /workspaces/:workspaceId/tasks/:taskId` | Edit or delete a task |
| `POST /workspaces/:workspaceId/tasks/:taskId/move` | Change status and position |
| `GET /health` | Liveness and database connectivity |

### Acceptance criteria

- [x] A new user can sign up, verify their email through the mail catcher, log in and log out.
- [x] Login is rate limited to 5 attempts per minute per IP and email, using Redis.
- [x] A user can create a workspace, invite a second user by link and see them join as a member.
- [x] An invite link works exactly once and expires after 7 days.
- [x] Tasks can be created, edited, assigned, moved between columns and reordered by drag and drop; order survives a reload.
- [x] Two rapid moves of the same task never corrupt the order of other tasks.
- [x] An automated test proves user A cannot read, change or delete any workspace, project or task of user B, and it covers every endpoint.
- [x] Session cookies are httpOnly, Secure and SameSite=Lax, and passwords never appear in logs.
- [ ] CI runs typecheck, lint, unit tests, integration tests and one Playwright flow on every pull request, and `main` deploys to staging automatically.

### Claude Code tasks

1. In plan mode, have Claude propose the monorepo scaffold, then generate it, write `CLAUDE.md` from the starter in section 3 and add a hook that runs typecheck and lint after edits.
2. Write the Drizzle schema, the first migration (with a down migration) and a seed script that creates three users and two workspaces for isolation tests.
3. Write failing integration tests for auth and tenant isolation first, using Testcontainers for a real Postgres.
4. Integrate the auth library by following its current docs, then make the auth tests pass.
5. Build workspaces and invites, then the tasks API, each behind its own failing tests.
6. Build the board UI with drag and drop and optimistic updates, plus one Playwright test for the main flow.
7. Add the GitHub Actions pipeline and the staging deployment.

### Review checklist

- [x] Every query on a tenant-owned table filters by `workspace_id` (search the codebase and confirm a test would fail without it).
- [x] Authorization is enforced in the service layer, not only hidden in the UI.
- [x] Every route validates input with Zod and rejects unknown fields.
- [x] Invite tokens are stored hashed, single use and expiring.
- [x] Login and password reset responses do not reveal whether an email has an account.
- [ ] No secrets in the repo, logs or client bundle; `.env.example` is complete.
- [x] The CSRF approach for cookie sessions is written down and tested.

### Learning exercises

- Explain authentication versus authorization using your own code as the examples.
- Break isolation on purpose: delete the `workspace_id` filter from one query and see which tests fail. If none do, write one.
- Compare integer positions with fractional indexing, and write down what each does under concurrent moves.
- Read the auth library's session code and summarize in half a page how a session is created, stored and revoked.
- Write an ADR on session cookies versus JWTs.


## Open questions (answer before coding)

**Answered 2026-10-02: all defaults accepted.** Each default below is now a decision; the larger ones get an ADR in `docs/adr/`.

**Architecture and auth**

1. **One origin or two?** Next.js (web) and Fastify (server) run as separate processes. If the browser talks to both directly, cookies and CSRF get harder (CORS, cross-port cookies).
   *Default:* the browser only talks to Next.js. Next.js rewrites `/api/*` to Fastify, so there is one origin, cookies stay first-party and SameSite=Lax does real work.
2. **Which auth library?** Auth.js is built around Next.js. This design runs auth on the Fastify server.
   *Default:* Better Auth, mounted in Fastify, with its Drizzle adapter. Write an ADR.
3. **Who owns the `users` table?** Better Auth has its own user, session, account and verification tables, and its column names differ from the spec (for example a boolean `emailVerified` instead of `email_verified_at`).
   *Default:* use the auth library's schema, generated into `packages/db`, and accept its column names. The spec allows this ("plus whatever the auth library requires").
4. **CSRF approach** (review checklist item).
   *Default:* SameSite=Lax cookies, plus an `Origin` header check on every non-GET request, plus Better Auth's own origin checks. Write it down in an ADR and add a test that sends a cross-origin POST and expects 403.

**Rules the spec leaves open**

5. **Login rate limit:** "5 attempts per minute per IP and email". Is that one counter per (IP, email) pair, or two separate limits?
   *Default:* two Redis counters, 5 per minute per IP and 5 per minute per email. Every attempt counts, not only failures. Return the same 429 either way.
6. **Invite acceptance:** must the person accepting have the same email address the invite was sent to?
   *Default:* yes. A logged-in user whose email differs gets a clear error, and the invite stays unused. Inviting someone who is already a member returns 409. Sending a new invite to the same email cancels the old one.
7. **Deleting a workspace:** hard delete or soft delete?
   *Default:* hard delete (cascades to members, invites, projects and tasks), owner only, and the user must type the workspace name to confirm. Soft delete and audit can come in Phase 4.
8. **Projects:** the spec has no rename or delete endpoints for projects.
   *Default:* add `PATCH` and `DELETE /workspaces/:workspaceId/projects/:projectId` so the isolation test covers them too.
9. **Who can do what in Phase 1:** can members create projects, edit tasks and delete any task?
   *Default:* members can do anything with projects and tasks. Only owners can rename or delete the workspace and create invites.
10. **Assignee rules:** *Default:* the assignee must be a member of the workspace. When a member leaves, their tasks are unassigned.
11. **Field limits:** *Default:* title 1–200 characters, description up to 10,000, workspace and project names 1–80. The slug is generated from the name, with a numeric suffix if it is taken.

**Ordering under concurrency**

12. **How does a move say where the task goes?** If the client sends a finished position string, two clients can compute the same key between the same neighbours and create duplicates.
    *Default:* the client sends `{ status, beforeTaskId?, afterTaskId? }`. The server locks the neighbour rows, computes the key with the `fractional-indexing` library and writes one row, all in one transaction. Boards sort by `(position, id)` so a tie can never reorder other tasks. Write a test that sends two rapid moves at the same time.

**Tooling gaps**

13. **Down migrations:** Drizzle Kit generates up migrations only.
    *Default:* each generated migration gets a hand-written `down.sql` next to it. A small script applies them, and CI runs up, down, then up again against seeded data. Write an ADR.
14. **"Covers every endpoint":** how does the isolation test know about every endpoint?
    *Default:* the test reads Fastify's route table (`app.printRoutes` or an `onRoute` hook). It fails if any `/workspaces/:workspaceId/...` route has no cross-tenant case.
15. **Staging:** the host (Fly.io or Railway), email in staging (Mailpit only runs locally), and the GitHub OAuth apps (you need one for local and one for staging).
    *Default:* Fly.io with Fly Postgres and Upstash Redis, and Resend's free tier for staging email. This needs accounts, which only you can create, so it waits until task 7.
16. **Cloud sessions have no running Docker daemon**, so Testcontainers cannot start containers there. Postgres 16 and Redis 7 are installed directly, though.
    *Default:* integration tests read `DATABASE_URL` and `REDIS_URL` when they are set, and fall back to Testcontainers when they are not. CI uses Testcontainers. Cloud sessions use the local services, started by a SessionStart hook.
17. **Library versions:** Next.js is on version 16, which changed some APIs. *Default:* pin current versions at scaffold time and read each library's docs, plus `node_modules/next/dist/docs/`, before writing code that uses it.
