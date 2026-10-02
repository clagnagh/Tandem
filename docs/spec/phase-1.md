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

- [ ] A new user can sign up, verify their email through the mail catcher, log in and log out.
- [ ] Login is rate limited to 5 attempts per minute per IP and email, using Redis.
- [ ] A user can create a workspace, invite a second user by link and see them join as a member.
- [ ] An invite link works exactly once and expires after 7 days.
- [ ] Tasks can be created, edited, assigned, moved between columns and reordered by drag and drop; order survives a reload.
- [ ] Two rapid moves of the same task never corrupt the order of other tasks.
- [ ] An automated test proves user A cannot read, change or delete any workspace, project or task of user B, and it covers every endpoint.
- [ ] Session cookies are httpOnly, Secure and SameSite=Lax, and passwords never appear in logs.
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

- [ ] Every query on a tenant-owned table filters by `workspace_id` (search the codebase and confirm a test would fail without it).
- [ ] Authorization is enforced in the service layer, not only hidden in the UI.
- [ ] Every route validates input with Zod and rejects unknown fields.
- [ ] Invite tokens are stored hashed, single use and expiring.
- [ ] Login and password reset responses do not reveal whether an email has an account.
- [ ] No secrets in the repo, logs or client bundle; `.env.example` is complete.
- [ ] The CSRF approach for cookie sessions is written down and tested.

### Learning exercises

- Explain authentication versus authorization using your own code as the examples.
- Break isolation on purpose: delete the `workspace_id` filter from one query and see which tests fail. If none do, write one.
- Compare integer positions with fractional indexing, and write down what each does under concurrent moves.
- Read the auth library's session code and summarize in half a page how a session is created, stored and revoked.
- Write an ADR on session cookies versus JWTs.

