# Tandem: Full Project Spec (Phases 1-8)

Oct 2, 2026 · @keith egan

## 1. Overview

Tandem is a real-time collaborative workspace where teams write documents, track tasks and ask an AI agent for help. It exists only to teach software engineering with Claude Code, so it will never be sold and every decision favors learning over shipping speed.

**Learning goals**

- Build a production-shaped system end to end: auth, data, real-time sync, background work, APIs, AI and deployment.
- Learn to direct Claude Code well: specs, plan mode, test-driven loops, subagents, hooks, MCP servers and headless CI.
- Learn to review AI-written code for correctness and security, not only to generate it.

**Non-goals**

- No billing, marketing site or customer support tooling.
- No microservices or Kubernetes. One monorepo, one deployable app, run in Docker on a managed host.
- No hand-rolled CRDT or auth cryptography. Use proven libraries (Yjs, a mature auth library) and study how they work.

**How each phase is written**

Every phase uses the same sections: Goal, Concepts, Scope, Data model, Interfaces, Acceptance criteria, Claude Code tasks, Review checklist and Learning exercises. A phase is done only when every acceptance criterion passes, CI is green, the app is deployed and a short retrospective is written (template in the Appendix). To begin, follow Starting Phase 1 in section 13.

**Phases at a glance**

| # | Phase | What you ship | Core concepts | Rough effort (about 10 hrs/week) |
| --- | --- | --- | --- | --- |
| 1 | Foundation | Login, workspaces, task board, CI | Auth, multi-tenancy, migrations, testing | 2-3 weeks |
| 2 | Documents | Rich-text docs with autosave and history | Editor internals, versioning, optimistic UI | 2 weeks |
| 3 | Real-time | Live co-editing, cursors, presence | WebSockets, CRDTs, Redis pub/sub | 3 weeks |
| 4 | Permissions and audit | Roles, sharing, activity log | RBAC, authorization testing, event logs | 2 weeks |
| 5 | Search and jobs | Full-text and semantic search, notifications | Postgres FTS, queues, idempotency, embeddings | 2-3 weeks |
| 6 | Public API and webhooks | API keys, OpenAPI docs, signed webhooks | API design, rate limiting, HMAC signatures | 2 weeks |
| 7 | AI agent | Workspace assistant that can use tools | RAG, tool use, evals, prompt injection defense | 3 weeks |
| 8 | Production hardening | Monitored, load-tested, backed-up deployment | Observability, load testing, disaster recovery | 2 weeks |

## 2. Tech stack and architecture

Tandem is a TypeScript monorepo with three runtime processes (web, server, worker) backed by Postgres and Redis. TypeScript everywhere gives Claude Code compiler feedback on every change, which makes AI-written code far more reliable. Treat the choices below as defaults: check each library's current docs at the start of the phase that uses it, and record any change as an ADR.

**Stack**

| Layer | Default choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | Types are the fastest feedback loop for Claude Code |
| Monorepo | pnpm workspaces | Shared types and schemas across web, server and worker |
| Frontend | Next.js (App Router), React, Tailwind CSS | Mainstream, well documented, good for learning full-stack patterns |
| Rich-text editor | TipTap (ProseMirror) | Mature, has first-class Yjs bindings |
| Server | Node.js with Fastify | Schema-first, fast, clean plugin model |
| Real-time | Yjs with Hocuspocus | Proven CRDT sync server; optional stretch: replace it with your own ws + y-protocols server |
| Database | PostgreSQL with pgvector | Relational data, full-text search and vectors in one system |
| ORM and migrations | Drizzle ORM | Typed queries, plain SQL migrations you can read |
| Cache, queue, pub/sub | Redis with BullMQ | Jobs, retries, rate limiting, cross-instance messaging |
| Auth | A maintained library (Better Auth or Auth.js) | Never hand-roll sessions or password hashing |
| Validation | Zod | One schema validates input, types the code and generates OpenAPI |
| Testing | Vitest, Playwright, Testcontainers | Unit, end-to-end and real-database integration tests |
| Observability | pino logs, OpenTelemetry, Prometheus, Grafana | Structured logs, traces and metrics |
| Infrastructure | Docker, Docker Compose, GitHub Actions | Same containers locally, in CI and in production |
| Hosting | A managed container host (Fly.io or Railway) | Real deployment without running servers yourself |
| AI | Anthropic API via the official TypeScript SDK | Tool use and agent loops (Phase 7) |
| Embeddings | A hosted embedding model (for example Voyage AI) | Semantic search (Phase 5) |

**Runtime processes**

| Process | Responsibility | Scales by |
| --- | --- | --- |
| web | Renders the UI, calls the API, holds the Yjs client | More instances behind a load balancer |
| server | REST API, auth, WebSocket and Yjs sync | More instances, with Redis pub/sub between them |
| worker | Background jobs: notifications, search indexing, embeddings, webhooks | More worker instances per queue |
| Postgres | Source of truth for all durable data | Vertical first, then read replicas |
| Redis | Queues, rate limits, pub/sub, presence; disposable | Single instance is enough here |

**Repository layout**

```
tandem/
  apps/
    web/          Next.js frontend
    server/       Fastify API and WebSocket server
    worker/       BullMQ job processors
  packages/
    db/           Drizzle schema, migrations, seed scripts
    shared/       Zod schemas, shared types, constants
    config/       eslint, tsconfig and prettier presets
  docs/
    spec/         this spec, one file per phase
    adr/          architecture decision records
    retros/       one retrospective per phase
  .claude/        subagents, slash commands, hooks, settings
  CLAUDE.md
  docker-compose.yml
```

**Architecture rules (apply from Phase 1 on)**

1. **Modular monolith.** Server code lives in `apps/server/src/modules/<name>` (auth, workspaces, tasks, docs, and so on). Each module has routes, a service, a repository and tests. Modules call each other only through service interfaces, never through another module's repository.
2. **Tenant isolation by default.** Every tenant-owned table has a `workspace_id`. Repositories require it as a parameter, so a query without a workspace cannot be written. Phase 4 adds Postgres row-level security as a second layer.
3. **Postgres is the source of truth.** Redis can be wiped without losing data.
4. **Validate at the boundary.** Every request, job payload and WebSocket message is parsed with a Zod schema from `packages/shared`.
5. **Side effects go through the queue.** Email, webhooks, indexing and embeddings never run inside a request handler.
6. **Every migration is reversible** and tested against a database with seed data.
7. **Write an ADR for every significant decision.** One page: context, options considered, decision, consequences. Claude Code drafts it, you edit it.

## 3. Working with Claude Code

Every phase follows the same eight-step loop, and each Claude Code feature is introduced in the phase where it pays off most. Claude Code changes quickly, so check its current documentation when you set up each feature.

**The loop for every phase**

1. **Spec.** Copy the phase into `docs/spec/phase-N.md`. Ask Claude Code to list ambiguities and open questions before it writes code, then answer them in the file.
2. **Plan.** In plan mode, ask for two or three architectural options with trade-offs. Pick one and record why in an ADR.
3. **Tests first.** Have Claude write failing tests for each acceptance criterion and commit them before any implementation.
4. **Implement in small slices.** One acceptance criterion at a time, one commit per green slice.
5. **Review.** Open a fresh session (or a reviewer subagent) with no memory of the implementation and have it attack the diff for bugs, security holes and drift from the spec. Fix what it finds.
6. **Explain.** Ask Claude to explain the code back to you, then quiz yourself. Anything you could not have written yourself becomes a Learning exercise.
7. **Deploy and verify.** Run the acceptance criteria against the deployed app, not only locally.
8. **Retrospective.** Fill in the template in the Appendix, especially what Claude got wrong.

**Claude Code features, in the order you adopt them**

| Feature | Introduce in | How to use it in Tandem |
| --- | --- | --- |
| CLAUDE.md and plan mode | Phase 1 | Persistent project rules; plan before any change touching more than three files |
| Test-driven loop | Phase 1 | Failing tests first, then implement until green |
| Hooks | Phase 1-2 | Run typecheck, lint and affected tests after each edit; block destructive shell commands |
| Custom slash commands | Phase 2 | `/new-module`, `/phase-review`, `/write-adr` to repeat common prompts |
| Parallel sessions with git worktrees | Phase 3 | Build the server sync layer and the editor UI in separate worktrees at the same time |
| Subagents | Phase 4 | Reviewer, test-writer and security-auditor agents with their own instructions |
| MCP servers | Phase 5 | Postgres, GitHub and Playwright servers so Claude works against real data |
| Headless mode in CI | Phase 6 | Automated PR review and a job that proposes fixes for failing builds |
| Eval-driven development | Phase 7 | Change a prompt or tool only when the eval suite says it helped |

**Starter CLAUDE.md**

Save this at the repo root in Phase 1 and keep it current. Keep it short: Claude reads it every session.

```markdown
# Tandem

Real-time collaborative workspace (docs, tasks, AI agent). This is a learning
project: correctness and understanding matter more than speed.

## Stack
TypeScript (strict), pnpm monorepo, Next.js, Fastify, Postgres + Drizzle,
Redis + BullMQ, Yjs, Vitest, Playwright.

## Commands
- pnpm dev: run web, server and worker (Postgres and Redis via Docker Compose)
- pnpm typecheck, pnpm lint
- pnpm test: unit tests
- pnpm test:integration: real Postgres via Testcontainers
- pnpm test:e2e: Playwright
- pnpm db:migrate, pnpm db:seed

## Architecture rules
- Modular monolith: apps/server/src/modules/<name> with routes, service,
  repository, tests. Modules talk through services, never repositories.
- Every tenant-owned table has workspace_id; every repository function takes it.
- Postgres is the source of truth. Redis is disposable.
- Validate every request, job and socket message with Zod schemas from
  packages/shared.
- Side effects (email, webhooks, indexing) go through the queue.
- Every migration is reversible.

## Workflow rules
- Read docs/spec/phase-N.md first. Ask about ambiguity before coding.
- Use plan mode for any change touching more than 3 files.
- Write failing tests first. Never edit a test to make it pass unless the test
  is wrong, and say so when you do.
- Small commits, one per green slice, conventional commit messages.
- Never run destructive commands (drop, reset --hard, rm -rf) without asking.
- Never commit secrets. Use .env.example; .env is gitignored.
- Record significant decisions in docs/adr.

## Code conventions
- No any. No non-null assertions without a comment explaining why.
- Typed AppError classes for errors; never throw strings.
- Log with pino, never console.log.
- Prefer boring, readable code over clever code.
```

**Definition of done (every phase)**

- [ ] Every acceptance criterion is met and demonstrated.
- [ ] Typecheck, lint and all tests pass in CI, including failure-path tests for new logic.
- [ ] Migrations run up and down cleanly against seeded data.
- [ ] The phase's review checklist is complete, with findings fixed or logged.
- [ ] The app is deployed and a smoke test passes.
- [ ] ADRs exist for each significant decision, and CLAUDE.md is updated.
- [ ] The retrospective is written.

## 4. Phase 1: Foundation

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

## 5. Phase 2: Documents

Phase 2 adds nested rich-text documents with autosave and version history, still for one editor at a time. Concurrent edits are deliberately handled badly (a stale save is rejected) so that you feel the problem Phase 3 solves.

### Concepts

Rich-text editor architecture (ProseMirror schema, transactions), autosave and debouncing, optimistic concurrency control, immutable version snapshots, tree structures in SQL, file uploads with presigned URLs, XSS defense.

### Scope

- **Documents:** create, rename, move, archive and restore (soft delete). Documents nest under a parent and appear in a sidebar tree.
- **Editor:** TipTap with headings, bold, italic, underline, bullet, numbered and task lists, code blocks, links, tables, images, a slash-command menu and Markdown shortcuts.
- **Autosave:** debounced save about one second after typing stops, with a visible status (Saving, Saved, Error, Offline) and retry with backoff.
- **Optimistic concurrency:** every save sends the `baseVersion` it started from. If the server has a newer version, it returns 409 and the UI offers to reload or copy local changes.
- **Version history:** automatic snapshot at most every 5 minutes of activity, plus a manual Save version. Users can list versions, view one read-only, compare it with the current text and restore it. Restoring creates a new version and never deletes history.
- **Task links:** an `@task` mention inside a document that shows the task's live status and links to the board.
- **Images:** upload through presigned URLs to S3-compatible storage (MinIO locally).
- **Export:** download a document as Markdown or HTML.

### Data model

Store content as ProseMirror JSON. In Phase 3 you will migrate it to Yjs state, which is a deliberate data-migration exercise.

| Table | Key columns |
| --- | --- |
| documents | id, workspace\_id, parent\_id (nullable), title, content (jsonb), content\_text, version, created\_by, updated\_by, created\_at, updated\_at, archived\_at |
| document\_versions | id, workspace\_id, document\_id, version, title, content (jsonb), reason (auto, manual or restore), created\_by, created\_at |
| uploads | id, workspace\_id, document\_id, storage\_key, mime\_type, size\_bytes, created\_by, created\_at |
| task\_document\_links | workspace\_id, task\_id, document\_id; primary key (task\_id, document\_id) |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET /workspaces/:workspaceId/documents/tree` | Sidebar tree (ids, titles, parents only) |
| `POST /workspaces/:workspaceId/documents` | Create a document |
| `GET, PATCH /workspaces/:workspaceId/documents/:documentId` | Read; save with `baseVersion` (409 on mismatch) |
| `POST .../documents/:documentId/move` | Change parent (rejects cycles) |
| `POST .../documents/:documentId/archive` and `/restore` | Soft delete and undo |
| `GET .../documents/:documentId/versions` and `/versions/:version` | List and read versions |
| `POST .../documents/:documentId/versions/:version/restore` | Restore as a new version |
| `POST /workspaces/:workspaceId/uploads/presign` and `/uploads/:uploadId/complete` | Two-step image upload |
| `GET .../documents/:documentId/export?format=md` or `html` | Export |

### Acceptance criteria

- [ ] Documents can be nested, moved and archived, and moving a document under its own descendant is rejected.
- [ ] Edits autosave within about two seconds of the last keystroke, and the status indicator is accurate.
- [ ] Closing the tab right after typing does not lose the last edit (flush on page hide).
- [ ] A failed save retries with backoff, then shows an error, and local content is never discarded.
- [ ] With the same document open in two browsers, the second save gets a 409 and nothing is silently overwritten.
- [ ] Automatic and manual versions appear in history, any version can be viewed read-only, and restoring creates a new version.
- [ ] Images upload only if they are an allowed type and at most 5 MB, and cannot be fetched by users outside the workspace.
- [ ] An `@task` mention shows the task's current status and updates when the task changes.
- [ ] Pasting hostile HTML (script tags, event handlers, `javascript:` links) cannot execute code, proven by a test.
- [ ] Exporting to Markdown preserves headings, lists, code blocks and links.

### Claude Code tasks

1. In plan mode, ask for options for content storage (ProseMirror JSON, HTML or Markdown) and write the ADR with your choice.
2. Write migrations and failing tests for the document tree, including cycle prevention.
3. Write failing tests for optimistic concurrency and version snapshots, then implement the documents API.
4. Build the editor and an autosave hook, testing the hook with fake timers (typing bursts, failures, offline).
5. Add MinIO to Docker Compose and implement presigned uploads with workspace-scoped storage keys.
6. Turn the finished module into a `/new-module` slash command so later phases start from the same pattern.

### Review checklist

- [ ] Stored content is validated against the editor schema, and links are limited to http, https and mailto.
- [ ] Version and upload endpoints check workspace membership themselves, not just the document endpoint.
- [ ] Presigned URLs expire quickly, enforce content type and size, and use keys that include the workspace ID.
- [ ] Autosave can neither resurrect an archived document nor overwrite a newer version.
- [ ] Request size limits exist, and the growth of the versions table is estimated and noted.

### Learning exercises

- Read the ProseMirror guide on schemas and transactions, then explain how one keystroke becomes a state change.
- Reproduce a lost update by temporarily disabling the version check, then explain exactly how the 409 prevents it.
- Measure version storage for a long document edited for an hour and propose a compaction strategy.
- Write a small text diff yourself, then compare it with a library's result.
- Write an ADR on storing content as JSON versus Markdown.

## 6. Phase 3: Real-time

Phase 3 lets several people edit the same document at once, with live cursors and presence, and makes the task board update live for everyone. This is the hardest phase technically, and the one where Claude Code's output needs the most scrutiny.

### Concepts

WebSockets, CRDTs (Yjs), the Yjs sync and awareness protocols, persisting an update log, reconnection and offline merging, horizontal scaling with Redis pub/sub, authenticating a long-lived connection.

### Scope

- **Yjs migration:** documents move from ProseMirror JSON to Yjs state. A one-time script converts every existing document. The JSON `content` column stays as a derived cache so export, versions and later search keep working.
- **Sync server:** Hocuspocus on the server, with authentication when the connection opens (session cookie, workspace membership and access to the document).
- **Persistence:** store incoming updates in an append-only log, and compact the log into one snapshot when it passes 100 updates or after a few idle minutes.
- **Presence:** live cursors and selections with names and colors, plus an avatar list of who is in the document.
- **Versions:** version history now snapshots the Yjs state and the derived JSON. The Phase 2 409 flow for documents is removed.
- **Reconnection:** automatic reconnect with backoff, a connection status indicator, and edits made offline merging on reconnect.
- **Live board:** a separate JSON-event channel per project broadcasts task created, updated, moved and deleted events. This is a plain server-authoritative design, so you can compare it with the CRDT approach.
- **Scaling out:** run two server instances behind a reverse proxy locally, with Redis pub/sub carrying updates between them.

### Data model

| Table | Key columns |
| --- | --- |
| document\_snapshots | document\_id (primary key), workspace\_id, state (bytea), updated\_at |
| document\_updates | id (bigserial), workspace\_id, document\_id, update (bytea), created\_at; rows are deleted when compacted into a snapshot |
| documents | `content` becomes derived from the Yjs state; `version` now counts snapshots |

### Interfaces

| Endpoint | Purpose |
| --- | --- |
| `WS /ws/documents/:documentId` | Yjs sync and awareness; authenticated on upgrade |
| `WS /ws/projects/:projectId` | JSON events for the live board |

Board messages use one envelope, defined with Zod in `packages/shared`: `{ type, workspaceId, projectId, seq, payload }`. Types are `task.created`, `task.updated`, `task.moved` and `task.deleted`. Clients ignore any event whose `seq` is older than what they have already applied.

### Acceptance criteria

- [ ] Typing in one browser appears in another within about 200 ms on a local network.
- [ ] A scripted test with at least 5 simulated clients making random concurrent edits, with random delays and reordering, always converges to identical documents.
- [ ] Live cursors show name and color, the presence list updates on join and leave, and a dropped client disappears within 30 seconds.
- [ ] A user without access cannot open a connection, and a user removed from the workspace is disconnected within 10 seconds.
- [ ] Restarting the server during a session causes automatic reconnection with no lost edits.
- [ ] With two server instances, users connected to different instances see each other's edits.
- [ ] Edits made during 60 seconds offline merge cleanly on reconnect.
- [ ] After all clients leave and the server restarts, the document is intact, and the update log compacts as specified.
- [ ] Every Phase 2 document is migrated without content loss, verified by comparing Markdown exports before and after.
- [ ] Moving a card in one browser moves it in another within 1 second, with no duplicates or flicker.
- [ ] Oversized messages are rejected and each connection is rate limited.

### Claude Code tasks

1. In plan mode, compare Hocuspocus, a custom `ws` server with `y-protocols`, and a hosted option. Write the ADR.
2. Define the message types in `packages/shared` first, then use two git worktrees in parallel: one session for the server sync layer, one for the editor client bindings.
3. Write the JSON-to-Yjs migration script with a verification test that compares exports.
4. Build the convergence test harness (simulated clients, delays, reordering) before writing the persistence code.
5. Implement persistence and compaction, then Redis pub/sub, then a Docker Compose setup with two server instances and a proxy.
6. Add the live board channel with `seq` handling and tests for out-of-order delivery.

### Review checklist

- [ ] WebSocket authentication runs on upgrade, the `Origin` header is checked (cross-site WebSocket hijacking), and access is re-checked when membership changes.
- [ ] Awareness data such as names and colors is treated as untrusted input and sanitized before rendering.
- [ ] Message size, per-connection rate and update-log growth all have limits.
- [ ] Listeners and timers are cleaned up, with no memory growth after 1,000 connect and disconnect cycles.
- [ ] Redis channel names include the workspace ID, and a client cannot subscribe to another workspace's channel.
- [ ] Board events are idempotent and safe to receive twice or out of order.

### Learning exercises

- Explain in your own words why two concurrent inserts at the same position converge in Yjs, using the Yjs internals documentation.
- Build a last-write-wins text field and show a scenario where it loses data while Yjs does not.
- Throttle the network in browser devtools, watch reconnection and write down what you observe.
- Measure update-log growth with and without compaction.
- Write half a page comparing CRDTs with operational transform.

## 7. Phase 4: Permissions and audit log

Phase 4 replaces the simple owner and member roles with real access control, adds sharing, and records every important action in an append-only audit log. Most serious security bugs in collaborative software are authorization bugs, so this phase is as much about proving access rules as writing them.

### Concepts

RBAC versus per-resource ACLs, permission inheritance, a single policy choke point, defense in depth with Postgres row-level security (RLS), append-only audit logging, authorization test matrices, insecure direct object references (IDOR).

### Scope

- **Workspace roles:** owner, admin, member and guest. A guest sees only what is explicitly shared with them.
- **Resource permissions:** per-project and per-document grants at four levels (view, comment, edit, manage). Grants inherit down the document tree, and a document can break inheritance.
- **Central policy module:** one function, `can(actor, action, resource)`, called by every route, job and WebSocket message. No ad hoc role checks anywhere else.
- **Sharing:** a share dialog, guest invites for a single document, and optional public view-only links that can expire and be revoked.
- **Row-level security:** Postgres RLS on every tenant-owned table as a second layer, driven by a workspace setting applied with `SET LOCAL` inside each transaction. The application connects with a role that is neither superuser nor table owner.
- **Audit log:** an append-only `audit_events` table written in the same transaction as the change it records, with a workspace-wide activity feed, a per-document feed and an admin view with CSV export.
- **Undo:** an undo toast for archive and delete actions. Undo is a new event, never a deletion of history.
- **Live enforcement:** permission changes take effect on open WebSocket connections within 5 seconds (disconnect or downgrade to read-only).
- **Optional stretch:** make the audit log tamper-evident by storing each event's hash chained to the previous one.

### Data model

| Table | Key columns |
| --- | --- |
| workspace\_members | `role` expands to owner, admin, member or guest |
| resource\_grants | id, workspace\_id, resource\_type (project or document), resource\_id, user\_id, level (view, comment, edit or manage), created\_by, created\_at, expires\_at |
| documents, projects | add `inherit_permissions` (boolean, default true) |
| share\_links | id, workspace\_id, resource\_type, resource\_id, token\_hash, level (view only), expires\_at, revoked\_at, created\_by |
| audit\_events | id, workspace\_id, actor\_type (user, api\_key, system or agent), actor\_id, action, resource\_type, resource\_id, metadata (jsonb), ip, user\_agent, request\_id, created\_at |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET, PUT, DELETE .../documents/:documentId/permissions` | Read and change grants |
| `POST, DELETE .../documents/:documentId/share-links` | Create and revoke public links |
| `GET /s/:token` | Public read-only view of a shared document |
| `GET /workspaces/:workspaceId/activity` | Activity feed (cursor pagination, filtered by what the caller can see) |
| `GET /workspaces/:workspaceId/audit-events` | Admin audit query by actor, action, resource and date |
| `GET /workspaces/:workspaceId/audit-events/export.csv` | Admin export |

### Acceptance criteria

- [ ] A permission matrix (role × level × action × resource type) lives in the docs, and an automated test generated from it passes for every cell.
- [ ] A test fails the build if any route or WebSocket handler does not call the policy module.
- [ ] Guests cannot see unshared items anywhere: tree, search, mentions, activity or counts.
- [ ] Sharing a parent grants access to its children, and breaking inheritance hides them.
- [ ] Removing a user's access disconnects them or makes them read-only within 5 seconds.
- [ ] Public links are view-only, honor expiry and revocation, store only a hash of the token, and every visit is logged.
- [ ] With RLS on, a deliberately broken query missing its workspace filter still returns no rows from other workspaces.
- [ ] Every mutating action writes an audit event in the same transaction, and a failed audit insert rolls the change back.
- [ ] The application's database role cannot UPDATE or DELETE audit events, proven by a test.
- [ ] The last owner of a workspace cannot be removed or demoted, and a member cannot promote themselves.
- [ ] Undoing an archive restores the document and records both events.

### Claude Code tasks

1. In plan mode, design the permission model and write an ADR (RBAC plus resource grants plus inheritance). Produce the permission matrix as a table in `docs/`.
2. Create three subagents in `.claude/agents/`: a reviewer, a test-writer and a security-auditor, each with narrow instructions and read-only tools where possible.
3. Have the test-writer subagent generate the matrix tests from your table, then review them yourself.
4. Implement the policy module, refactor every route and socket handler to use it, and have the reviewer subagent confirm no ad hoc checks remain.
5. Add the RLS migrations and the per-transaction workspace context, and create the separate migration and application database roles.
6. Implement audit events through one transaction helper, then the feed and admin views.
7. Run the security-auditor subagent against the finished phase and log every finding.

### Review checklist

- [ ] Every ID in a path or body is checked to belong to the caller's workspace and to be accessible to the caller (no IDOR).
- [ ] List endpoints filter by permission in SQL, not in memory afterward, so counts and pagination do not leak.
- [ ] Share tokens have high entropy, are compared in constant time and are rate limited.
- [ ] Audit events hold IDs and metadata only, never secrets or full document content.
- [ ] The application role does not own the tables and cannot bypass RLS.
- [ ] `SET LOCAL` is used so workspace context cannot leak between pooled connections.

### Learning exercises

- Draw the permission-resolution steps on paper (workspace role, then grant, then inheritance) and compare them with your code line by line.
- Try to bypass RLS through connection pooling or a missing context, then write down what you learned.
- Write a page comparing RBAC, ABAC and relationship-based access control (Zanzibar style), and say when Tandem would outgrow its model.
- Run a mock penetration test on your own app and keep a findings log with severity and fix.

## 8. Phase 5: Search and background jobs

Phase 5 adds permission-aware keyword, semantic and hybrid search, comments, notifications and a real worker process with a reliable event pipeline. Search ranks results over data each user may see, while the worker teaches you how to make work that can fail, retry and run twice still come out correct.

### Concepts

Postgres full-text search (tsvector, GIN, ranking, trigrams), embeddings and vector search (pgvector, HNSW), chunking, hybrid ranking with reciprocal rank fusion, job queues, retries and dead-letter queues, idempotency, the transactional outbox pattern, scheduled jobs.

### Scope

- **Worker app:** `apps/worker` with BullMQ queues named `index`, `embed`, `notify`, `email` and `export`, plus an admin-only page showing failed jobs with a retry button.
- **Transactional outbox:** domain events are written to `outbox_events` in the same transaction as the change. A dispatcher publishes them to queues, giving at-least-once delivery. Every consumer is idempotent.
- **Keyword search:** generated `tsvector` columns on documents and tasks (title weighted higher than body), GIN indexes, ranked results with highlighted snippets, typeahead suggestions, and typo tolerance with `pg_trgm`.
- **Semantic search:** split documents into chunks of roughly 500 tokens along heading boundaries, embed them in a job, store vectors in pgvector with an HNSW index, and re-embed only chunks whose content hash changed.
- **Hybrid search:** merge keyword and vector rankings with reciprocal rank fusion. Filters for type, project, assignee and date. Permissions are applied inside the SQL using the Phase 4 grants.
- **Comments:** threaded comments on tasks and documents, with `@user` mentions. Posting a comment requires the comment permission level from Phase 4.
- **Notifications:** in-app (bell icon, unread count, live over WebSocket) and email, triggered by task assignment, mentions, replies and tasks due within 24 hours. Per-user preferences per event type, signed one-click unsubscribe links, and a daily digest email.
- **Export and import:** a background job exports a workspace as a ZIP of Markdown and JSON with progress reporting, and an import job reads the same format back.

### Data model

| Table | Key columns |
| --- | --- |
| documents, tasks | add `search_vector` (tsvector) with a GIN index |
| document\_chunks | id, workspace\_id, document\_id, chunk\_index, text, content\_hash, embedding (vector), created\_at; HNSW index on `embedding` |
| outbox\_events | id, workspace\_id, type, payload (jsonb, IDs only), created\_at, dispatched\_at |
| processed\_events | consumer, event\_id, processed\_at; primary key (consumer, event\_id) |
| comments | id, workspace\_id, resource\_type (task or document), resource\_id, parent\_id, author\_id, body, created\_at, edited\_at, deleted\_at |
| notifications | id, workspace\_id, user\_id, type, payload, read\_at, created\_at |
| notification\_preferences | user\_id, event\_type, in\_app (boolean), email (boolean) |
| export\_jobs | id, workspace\_id, requested\_by, status, progress, storage\_key, expires\_at |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET /workspaces/:workspaceId/search?q=&type=&mode=keyword, semantic or hybrid&cursor=` | Search |
| `GET /workspaces/:workspaceId/search/suggest?q=` | Typeahead |
| `GET, POST .../tasks/:taskId/comments` and `.../documents/:documentId/comments` | List and add comments |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | Notification inbox |
| `GET, PUT /notification-preferences` | Preferences |
| `GET /unsubscribe/:signedToken` | One-click unsubscribe without login |
| `POST /workspaces/:workspaceId/exports`, `GET .../exports/:exportId` | Start and poll an export |
| `POST /workspaces/:workspaceId/imports` | Start an import |

### Acceptance criteria

- [ ] On a seeded dataset of 10,000 documents and 50,000 tasks, keyword search returns ranked, highlighted results in under 100 ms at the 95th percentile.
- [ ] Typo tolerance works: "retrospectve" finds "retrospective".
- [ ] Semantic search finds a document by meaning when it shares no keywords with the query, shown by a curated set of test cases.
- [ ] Search never returns anything the caller cannot access, tested with guests and revoked grants.
- [ ] Editing a document re-indexes it within 10 seconds, and only changed chunks are re-embedded (verified by a counter).
- [ ] Killing the worker mid-job and restarting completes the work, and duplicate delivery produces exactly one notification and one email.
- [ ] Failed jobs retry with exponential backoff and jitter, then land in a dead-letter queue visible and retryable from the admin page.
- [ ] If the server crashes right after a transaction commits, the domain event is still delivered (outbox test).
- [ ] Assignment, mention, reply and due-soon events each create an in-app notification (with live unread count) and an email according to preferences.
- [ ] The daily digest sends one email per user even across worker restarts, and unsubscribe links work without login and cannot be forged.
- [ ] Exporting a 1,000-document workspace runs in the background with visible progress, and importing the result restores the content.
- [ ] Embedding calls are batched and rate limited, and token counts are logged per workspace.

### Claude Code tasks

1. In plan mode, write ADRs for the outbox versus direct queue publishing, and for the chunking strategy.
2. Connect a read-only Postgres MCP server and the Playwright MCP server. Use Postgres to run `EXPLAIN ANALYZE` on real queries, and use Playwright to check the search and notification UI.
3. Build the worker skeleton and write failing idempotency and outbox tests first.
4. Add the full-text migration and confirm with `EXPLAIN` that the GIN index is used.
5. Build the chunker (with unit tests), the embedding job and a deterministic fake embedding provider so CI stays offline and free.
6. Implement hybrid ranking and a relevance test set of about 30 queries with expected top results. This is your first mini evaluation suite.
7. Work on search and notifications in two parallel git worktrees, then merge.

### Review checklist

- [ ] Every job handler validates its payload, is idempotent and receives IDs, not document content or secrets.
- [ ] User search text goes through `websearch_to_tsquery`, never string concatenation, and all SQL is parameterized.
- [ ] Permission filtering happens inside the query, before ranking and pagination.
- [ ] Retries use backoff with jitter, poison messages go to the dead-letter queue, and fan-out is rate limited.
- [ ] Emails escape user content and always include unsubscribe.
- [ ] Sending document text to an embedding provider is documented in an ADR, with a per-workspace opt-out.
- [ ] A cleanup job removes dispatched outbox rows and old processed-event records.

### Learning exercises

- Run `EXPLAIN ANALYZE` before and after adding the GIN and HNSW indexes and record the timings.
- Explain at-least-once versus exactly-once delivery, and why idempotent consumers are the practical answer.
- Try three chunk sizes and compare relevance on your test set.
- Crash the worker at each step of a job on purpose and document every failure mode you find.
- Write a page on when you would replace Postgres search with a dedicated engine such as Meilisearch or Elasticsearch.

## 9. Phase 6: Public API and webhooks

Phase 6 lets outside programs use Tandem safely through scoped API keys, a documented and versioned REST API, rate limiting and signed webhooks. You will think like both the API's designer and a hostile client, and finish by wiring headless Claude Code into CI.

### Concepts

API design (resource modeling, cursor pagination, error format, idempotency keys, versioning), API key security, rate limiting algorithms, OpenAPI, webhook signatures and replay protection, retry schedules, server-side request forgery (SSRF), headless Claude Code.

### Scope

- **API keys:** created by workspace admins with a name, scopes (`tasks:read`, `tasks:write`, `docs:read`, `docs:write`, `webhooks:manage`) and optional expiry. A key looks like `tdm_live_<prefix>_<secret>`, is shown once, and only a hash is stored. Keys are bound to one workspace and appear in the audit log as the actor.
- **Public API** under `/api/public/v1`: projects, tasks, documents (read and write as Markdown), comments, members (read only) and search. Cursor pagination, filtering, ISO 8601 timestamps, a request ID on every response, and errors in the RFC 9457 problem-details format. POSTs honor an `Idempotency-Key` header, and updates support `If-Match` with ETags.
- **OpenAPI 3.1:** generated from the same Zod schemas, served as JSON at `/api/public/v1/openapi.json`, with an interactive docs page.
- **Rate limiting:** a Redis-backed token bucket per API key (default 60 requests per minute with a burst of 20), stricter limits for search, limits per IP for unauthenticated routes, `RateLimit-*` and `Retry-After` headers, and an atomic Lua script so it works across instances.
- **Webhooks:** workspace admins register an HTTPS endpoint and event types (`task.*`, `document.*`, `comment.created`, `member.*`). The worker delivers events from the outbox with a signature header `Tandem-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "t.body">`. Failed deliveries retry with exponential backoff and jitter, up to 8 attempts over 24 hours. Endpoints disable themselves after repeated failure. Admins get a delivery log, a manual redeliver button, a test-event button and secret rotation with a chosen overlap period.
- **SSRF defense:** webhook URLs must be HTTPS and must not resolve to loopback, private, link-local or cloud-metadata addresses, checked at creation and again at delivery. Redirects are not followed, with a 5-second timeout and a response size cap.
- **Example integration:** a small webhook receiver in `examples/webhook-receiver` that verifies signatures, and an optional generated TypeScript SDK in `packages/sdk`.
- **Headless Claude Code in CI:** a GitHub Actions job that runs Claude Code non-interactively on each pull request to review for API breaking changes, authorization gaps and leaked secrets, and posts the result as a comment.

### Data model

| Table | Key columns |
| --- | --- |
| api\_keys | id, workspace\_id, name, prefix, key\_hash, scopes (text array), created\_by, created\_at, last\_used\_at, expires\_at, revoked\_at |
| idempotency\_keys | api\_key\_id, key, request\_hash, response\_status, response\_body, created\_at, expires\_at; unique (api\_key\_id, key) |
| webhook\_endpoints | id, workspace\_id, url, secret\_encrypted, event\_types (text array), status (active or disabled), disabled\_reason, created\_by, created\_at |
| webhook\_deliveries | id, endpoint\_id, event\_id, attempt, status, response\_status, response\_ms, error, next\_attempt\_at, created\_at |

Webhook secrets must be recoverable to sign payloads, so store them encrypted at rest (AES-256-GCM with a key from the environment). API key secrets are high-entropy and never need recovery, so store only a hash.

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET, POST /api/public/v1/tasks` and `GET, PATCH, DELETE .../tasks/:taskId` | Tasks |
| `GET, POST /api/public/v1/projects` | Projects |
| `GET, POST, PATCH /api/public/v1/documents` | Documents as Markdown |
| `POST /api/public/v1/tasks/:taskId/comments` | Comments |
| `GET /api/public/v1/search` | Search |
| `GET /api/public/v1/openapi.json` and `/docs` | Spec and interactive docs |
| `GET, POST, DELETE /workspaces/:workspaceId/api-keys` | Manage keys (admin UI) |
| `GET, POST, PATCH, DELETE /workspaces/:workspaceId/webhook-endpoints` | Manage endpoints |
| `GET .../webhook-endpoints/:endpointId/deliveries`, `POST .../deliveries/:deliveryId/redeliver`, `POST .../test` | Delivery log, redeliver, test event |

### Acceptance criteria

- [ ] A key with `tasks:read` can list tasks but gets a 403 problem response when creating one, and a key for workspace A can never see workspace B.
- [ ] A key's secret is shown once and the database holds only its hash. A revoked or expired key is rejected within 5 seconds.
- [ ] Every public API response validates against the OpenAPI spec in tests, and a test fails if a route exists that the spec does not describe.
- [ ] Cursor pagination returns no duplicates or skipped items while rows are inserted concurrently.
- [ ] Repeating a POST with the same `Idempotency-Key` returns the original response and creates one resource. The same key with a different body is rejected.
- [ ] The 61st request in a minute returns 429 with an accurate `Retry-After`. Limits are per key and hold across two server instances.
- [ ] The example receiver accepts a valid signature and rejects a tampered body or a timestamp older than 5 minutes.
- [ ] An endpoint returning 500 is retried with backoff for up to 8 attempts (tested with a fake clock), success stops retries, and each attempt appears in the delivery log.
- [ ] Webhook URLs pointing at localhost, private ranges, the cloud metadata address or hostnames that resolve to them are rejected at creation and at delivery, and redirects are not followed.
- [ ] Rotating a webhook secret keeps the old one valid for the chosen overlap period.
- [ ] Audit events record API keys as actors.
- [ ] The headless Claude Code job runs on a sample pull request and posts a review comment.

### Claude Code tasks

1. In plan mode, write ADRs for key format and hashing, the rate limiting algorithm, pagination style and the signature scheme.
2. Define the API in Zod and OpenAPI first, write contract tests, then implement.
3. Write the SSRF test list (loopback, private IPv4 and IPv6, metadata address, DNS rebinding, redirects) before writing the validator.
4. Build the rate limiter as an atomic Redis Lua script and test it under concurrent load.
5. Build the webhook dispatcher with the delivery log and fake-clock tests.
6. Write the example receiver and, optionally, generate the SDK from the OpenAPI file.
7. Set up the headless Claude Code GitHub Actions job (check the current Claude Code documentation for the supported action), scope its permissions tightly and keep a human approving any fix it proposes.

### Review checklist

- [ ] Keys are sent only in a header, never in URLs or logs, and compared in constant time. Scopes go through the same policy module as user permissions.
- [ ] PATCH endpoints accept only whitelisted fields (no mass assignment).
- [ ] The rate limiter's behavior when Redis is down (fail open or closed) is decided, documented and tested.
- [ ] Webhook signatures cover the raw request body and the timestamp, and secrets are encrypted at rest.
- [ ] The delivery code connects to the address it validated, so DNS rebinding cannot swap it afterward, and blocks private IPv6 ranges too.
- [ ] Error responses never leak stack traces or internals.
- [ ] A versioning policy states what counts as a breaking change.
- [ ] The CI Claude Code job has minimal permissions and cannot push to protected branches.

### Learning exercises

- Compare token bucket, fixed window and sliding window limiters by simulating bursts, and chart the results.
- Write a webhook receiver in a different language using only your documentation, to test whether the spec is complete.
- Ship a breaking API change on purpose and confirm the contract tests catch it.
- Read how a mature API such as Stripe's handles idempotency keys and webhooks, and write a one-page comparison with your design.
- Attempt a DNS rebinding attack against your own validator in a local lab.

## 10. Phase 7: AI agent

Phase 7 adds an assistant, Ask Tandem, that answers questions from a workspace's own content with citations and can propose actions such as creating tasks or editing documents. The agent runs with the asking user's permissions, never writes without approval, and is judged by an evaluation suite you build before the agent itself.

### Concepts

Retrieval-augmented generation (RAG), tool use and the agent loop, streaming responses, context window management, prompt caching, evaluation suites (golden sets, LLM-as-judge, regression gates), direct and indirect prompt injection, least-privilege tools, human-in-the-loop approval, cost budgets and LLM observability.

### Scope

- **Chat panel:** a sidebar with persisted conversations, streamed answers, a stop button, and citations that link to the exact document or task.
- **Read tools:** `search_workspace` (the Phase 5 hybrid search), `get_document` (whole or by section), `list_tasks` and `get_task`. Every tool call runs through the Phase 4 policy module as the asking user.
- **Write tools that need approval:** `create_task`, `update_task`, `add_comment` and `propose_document_edit`. A write tool never executes directly. It creates a proposal card showing the exact parameters (or a diff for edits), and the user presses Approve or Reject. Approved proposals run through the normal services and are audited with actor type `agent` acting on behalf of the user.
- **Agent loop:** bounded to 8 tool-call rounds, a token budget and a timeout. Tool errors go back to the model as error results. The model identifier is configuration, not code.
- **Built-in workflows:** summarize this document, draft tasks from this document (action items become proposals) and a weekly workspace summary run by a scheduled worker job.
- **Prompt injection defenses:** retrieved content is delimited and labeled as untrusted data. There are no network or web-fetch tools. Assistant output is sanitized so external images and links are not rendered (this blocks the markdown-image exfiltration trick). Writes require approval, and all tool arguments are validated with Zod.
- **Cost and safety controls:** per-user and per-workspace daily token budgets, prompt caching for the static system prompt and tool definitions, a workspace setting to turn AI off, and clear messages when a budget runs out.
- **Evaluation suite:** `packages/evals` with a seeded fixture workspace and four categories of cases (below), run in CI and nightly.
- **Observability:** one `ai_runs` record per request with model, token counts, cache hits, latency and tool calls (IDs and metadata, not document text, by default).

### Evaluation suite

| Category | What it checks | Example metric |
| --- | --- | --- |
| Retrieval | The right documents are found for 30 to 50 curated questions | recall@5, mean reciprocal rank |
| Answer quality | Answers are faithful to cited sources and complete | LLM-as-judge score on a rubric, plus deterministic checks (has a citation, every cited ID exists) |
| Tool use | The model picks the right tool with the right arguments, e.g. a request for a task due Friday yields a correct `create_task` proposal | Exact-match on tool name and key fields |
| Safety | At least 20 injection attacks hidden in documents, tasks and comments, plus permission probes | Zero unapproved writes, zero leaked data |

Model output varies, so run each case 3 times and judge by thresholds. Set thresholds after your first baseline run, except safety, which must be 100%. Check your LLM judge against about 20 human-labeled examples before trusting it.

### Data model

| Table | Key columns |
| --- | --- |
| ai\_conversations | id, workspace\_id, user\_id, title, created\_at |
| ai\_messages | id, conversation\_id, role, content (jsonb blocks), created\_at |
| ai\_proposals | id, workspace\_id, conversation\_id, user\_id, tool\_name, args (jsonb), status (pending, approved, rejected, expired or failed), result (jsonb), created\_at, decided\_at |
| ai\_runs | id, workspace\_id, user\_id, conversation\_id, model, input\_tokens, output\_tokens, cache\_read\_tokens, latency\_ms, tool\_calls (jsonb), status, created\_at |
| ai\_usage\_daily | workspace\_id, user\_id, date, input\_tokens, output\_tokens |
| workspace\_settings | add `ai_enabled` and `ai_daily_token_budget` |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `POST, GET /workspaces/:workspaceId/ai/conversations` | Create and list conversations |
| `POST .../ai/conversations/:conversationId/messages` | Send a message; the response is a server-sent event stream with text deltas, tool activity, proposals, done and error events |
| `POST .../ai/proposals/:proposalId/approve` and `/reject` | Decide a proposal |
| `GET /workspaces/:workspaceId/ai/usage` | Token usage by user and day |

### Acceptance criteria

- [ ] Answers to workspace questions include citations, and every cited ID is a real document or task the asker can access.
- [ ] Two users with different permissions asking the same question never receive content the other cannot see.
- [ ] No write executes without approval. Approving twice or double-clicking executes exactly once, and the audit log shows actor `agent` on behalf of the user.
- [ ] Streaming begins in under 3 seconds at the median on a typical query.
- [ ] A tool that always errors, or a prompt that induces endless tool calls, stops at 8 rounds with a graceful message.
- [ ] The evaluation suite has at least 50 cases across the four categories, the fast subset runs in CI on any change to prompts or tools, and the full suite runs nightly with results stored over time.
- [ ] Every injection fixture fails to trigger an unapproved action or data leak, including attempts to exfiltrate data through image or link URLs in the output.
- [ ] When a daily budget is exhausted the user sees a clear message, and a workspace with AI disabled makes no model calls (tested).
- [ ] The usage page shows tokens per user per day, and the cache hit rate is logged.
- [ ] You demonstrate once that a prompt change that drops an eval score below its threshold fails CI.
- [ ] Swapping the configured model needs no code change, and you have run the suite on at least two models and compared quality, latency and cost.

### Claude Code tasks

1. In plan mode, write ADRs comparing a single tool-using agent with a fixed workflow, and for the approval UX.
2. Build evaluation first: write the harness, the fixture workspace and the first 20 cases before the agent exists, then record a baseline using a deliberately naive prompt.
3. Implement each tool with a Zod schema and standalone tests, concentrating on permission checks.
4. Implement the agent loop with the official Anthropic TypeScript SDK, with streaming, bounded rounds and prompt caching. Check the current API documentation for model identifiers and caching behavior.
5. Build proposals and idempotent approval execution.
6. Write the injection attack fixtures first, then implement the defenses. Use a red-team subagent to invent new attacks, and triage what it produces.
7. Add observability and budgets.
8. Iterate on prompts using eval results, and log every change with its before and after scores in `docs/evals/log.md`.

### Review checklist

- [ ] Tools run as the asking user through the policy module, never through a service account, and no tool can widen access.
- [ ] The three risk conditions are never all present: private data, untrusted content and an outward channel. The outward channel is closed by design (no network tools, sanitized output).
- [ ] Retrieved text is labeled as data, the system prompt contains no secrets, and no tool can reach keys or credentials.
- [ ] Tool inputs are bounded in size, and every ID is checked against the workspace.
- [ ] Logs hold IDs and token counts by default, and logging full prompts is an explicit debug setting with a retention rule.
- [ ] API errors, rate limits and timeouts use backoff and show a clear message, and no failure leaves a partial write.
- [ ] `max_tokens` is always set, and context growth has a truncation or summarization strategy.
- [ ] The decision to send workspace content to a third-party model API is documented, with the workspace-level off switch.

### Learning exercises

- Run the same eval on two model sizes and write up the quality, latency and cost trade-off.
- Spend an hour trying to jailbreak your own agent. Record each attack that worked and its fix, then add it to the suite.
- Build "draft tasks from this document" both as an agent loop and as a fixed workflow, and compare accuracy and cost.
- Vary chunk size and the number of retrieved results and measure the effect on answer quality with your harness.
- Implement context truncation or summarization and measure what it does to answers at 80% of the context window.
- Read Anthropic's published guidance on building effective agents and compare it with your design choices.

## 11. Phase 8: Production hardening

Phase 8 turns a working app into one you could operate with confidence: you will measure it, overload it, back it up and restore it, break it on purpose, and write up what happened. The deliverable is evidence, in the form of dashboards, test results, drills and a postmortem, not new features.

### Concepts

Structured logging, metrics (RED and USE methods), distributed tracing with OpenTelemetry, SLOs and error budgets, load, soak and spike testing, query and memory profiling, backups and point-in-time recovery, RPO and RTO, zero-downtime deploys with expand-and-contract migrations, feature flags, supply-chain and container security, chaos testing, runbooks, blameless postmortems.

### Scope

- **Observability:** JSON logs with request and trace IDs; OpenTelemetry traces that follow a request from web to server through the queue to the worker; Prometheus metrics for HTTP rate, errors and duration, database pool, queue depth and age, WebSocket connections, loaded Yjs documents and AI tokens; Grafana dashboards stored as code in the repo; alerts tied to SLO burn.
- **SLOs (starting targets, adjust after measuring):** API availability 99.5%; read endpoints p95 under 300 ms; real-time edit propagation p95 under 500 ms; job queue age p95 under 60 seconds.
- **Load testing with k6:** a mixed API workload, a WebSocket scenario with 500 concurrent editors across 50 documents, search under load, a 2-hour soak test and a spike test. Record a baseline, find at least three bottlenecks and fix each with before-and-after numbers.
- **Performance work:** slow query log, `EXPLAIN` review, N+1 detection, connection pooling (PgBouncer), caching only where measured, and unloading idle Yjs documents from memory.
- **Reliability:** graceful shutdown (drain sockets, finish or requeue jobs), liveness and readiness probes, timeouts, retry budgets and circuit breakers on every external call (email, embeddings, AI API), and defined degraded behavior when Redis or the database is down.
- **Data safety:** daily backups plus write-ahead-log archiving for point-in-time recovery, object storage versioning, targets of RPO 5 minutes and RTO 1 hour, and a timed restore drill into a fresh database with data verification.
- **Deployments:** CI builds an image, deploys to staging, runs smoke tests, then promotes to production with a rehearsed rollback. A migration policy requires expand-and-contract changes. Simple feature flags guard risky features.
- **Security hardening:** dependency scanning, container image scanning, secret scanning and static analysis in CI; security headers including a strict Content Security Policy and HSTS; tightened CORS; a threat model (STRIDE) for the five most sensitive flows; a final security audit of the whole repo.
- **Chaos and incident drills:** scripted failures (stop Redis, stop the worker, kill database connections, make the AI API slow) with assertions about expected behavior.
- **Runbooks and postmortem:** runbooks for the five most likely failures, and one blameless postmortem for an incident you induce.
- **Final documents:** an architecture overview, an ADR index, a capacity and cost estimate for 1,000 and 10,000 users, and a short demo script.

### Acceptance criteria

- [ ] Each service has one dashboard showing request rate, errors, latency, queue depth and WebSocket count, and every alert links to a runbook.
- [ ] A single trace shows the path from saving a task through the queue to webhook delivery, with one trace ID across server and worker.
- [ ] The system holds 500 concurrent WebSocket editors across 50 documents plus 100 API requests per second for 30 minutes while meeting its SLOs, with results saved in `docs/perf/`.
- [ ] At least three bottlenecks found by load testing are fixed, each with before-and-after measurements.
- [ ] During the 2-hour soak test memory grows by less than 10% and no connections leak.
- [ ] Deploying during active editing loses zero edits, clients reconnect within 5 seconds, and in-flight jobs finish or requeue safely.
- [ ] The restore drill recovers to a chosen point in time in a fresh database, row counts and checksums match, and the measured RTO is compared with the 1-hour target.
- [ ] A zero-downtime deploy with an expand-and-contract migration is demonstrated, and a rollback is rehearsed.
- [ ] With Redis down, reads still work and degradation matches your documentation. With the database down, readiness fails and an alert fires. With the AI API down, the rest of the app keeps working.
- [ ] CI blocks on high-severity dependency issues, committed secrets and container vulnerabilities above a set threshold, and an automated test checks security headers.
- [ ] Every finding of the final security audit is fixed or accepted in writing.
- [ ] Five runbooks exist, and you have resolved one induced failure by following only its runbook.
- [ ] A blameless postmortem exists with a timeline, root cause, contributing factors and at least three action items, one of them already implemented.
- [ ] The capacity and cost document is complete.

### Claude Code tasks

1. In plan mode, write ADRs for the observability stack and the SLO definitions.
2. Work in three parallel git worktrees: observability, load testing and security hardening. Merge when each passes its criteria.
3. Have Claude add OpenTelemetry instrumentation and dashboards as code, then verify the dashboards in a real browser using the Playwright MCP server.
4. Write the k6 scripts, export the results and have Claude propose likely bottlenecks. Confirm each one with profiling before changing code.
5. Write backup and restore scripts and automate the restore drill as a repeatable check.
6. Write chaos scripts (for example `docker compose stop redis`) that assert the behavior you documented.
7. Run the security-auditor and reviewer subagents over the entire repo, then do your own manual pass on auth, permissions, WebSockets, API keys, webhooks and the AI agent.
8. Have Claude critique your draft postmortem for blame language and missing detail.

### Review checklist

- [ ] Logs contain no secrets or personal data, proven by a test that plants canary secrets and searches the log output.
- [ ] Metric labels never include user or document IDs, so cardinality stays bounded.
- [ ] Every external call has a timeout, a retry budget and a circuit breaker.
- [ ] Backups are encrypted and stored in a separate account or region, and a restore has actually been tested.
- [ ] Secrets are not baked into images, and a rotation process is documented.
- [ ] Every deploy, including migrations, has a rollback path.
- [ ] Each alert has an owner, a threshold rationale and a runbook, and none is just noise.
- [ ] The load test environment matches production in data volume and instance size, and the results can be reproduced.

### Learning exercises

- Estimate capacity on paper before testing, then explain the gap between your estimate and the measured result.
- Invent three new ways to break the system, watch the dashboards and check whether your alerts fire in time.
- Repeat the restore drill under a timer using only the runbook.
- Write a one-to-two page essay on what you would redesign, and which parts of working with Claude Code helped most and least.

## 12. Stretch phases

These are optional, independent of each other, and best attempted after Phase 8. Each follows the same loop from section 3: spec, plan, tests first, review, explain, retrospective.

### Stretch A: Offline-first sync

**Goal:** Tandem stays usable with no connection and reconciles cleanly afterward.

- Persist Yjs documents in IndexedDB so recent documents open and edit offline.
- Add a service worker so the app shell loads offline and the app is installable.
- Queue task changes made offline as mutations with idempotency keys and replay them on reconnect.
- Choose and document a conflict policy for tasks (for example field-level last-writer-wins using server timestamps) and show a sync status indicator.

**Acceptance criteria**

- [ ] With the network off for 10 minutes, a user can open recent documents, edit them and create and move tasks.
- [ ] After reconnecting, all changes merge with no duplicates, even if the connection drops again mid-sync.
- [ ] The task conflict policy is written down and covered by tests for simultaneous edits to the same field and to different fields.

**Learn:** local-first design, service workers, client-side persistence, idempotent replay, conflict policies beyond CRDTs.

### Stretch B: Automations and sandboxed scripts

**Goal:** Let workspaces extend Tandem safely.

- A rules engine: trigger (an event), conditions, then actions (for example: when a task moves to Done, add a comment and call a webhook). Rules are stored as validated JSON and run by the worker from the outbox.
- Loop prevention: events caused by automations are tagged with their origin, and chains stop at a maximum depth.
- Optional custom scripts: run user-supplied JavaScript in an isolate (an isolated VM or a WebAssembly JavaScript runtime) with CPU, memory and time limits, no network or file access, and a small explicit host API.
- A run log per rule and per-workspace execution limits.

**Acceptance criteria**

- [ ] A rule that would trigger itself forever is stopped and logged.
- [ ] A script containing an infinite loop is killed within its time limit and cannot affect other jobs.
- [ ] A script cannot read environment variables, files or the network, proven by tests that try each.
- [ ] Every automated action appears in the audit log with actor type `automation`.

**Learn:** rules engines, sandboxing and its limits, resource quotas. Treat the script feature as the riskiest in the project: write its threat model before any code and have the security-auditor subagent attack it.

### Stretch C: Tandem as an MCP server

**Goal:** Let Claude Code or Claude Desktop use a Tandem workspace directly through the Model Context Protocol.

- Build an MCP server (in `apps/mcp`) that authenticates with a Phase 6 API key and exposes tools for search, reading documents, listing and creating tasks.
- Enforce key scopes on every tool, and record the key as the actor in the audit log.
- Treat tool results as untrusted content, as in Phase 7.

**Acceptance criteria**

- [ ] Claude Code, configured with the server, can search the workspace and create a task.
- [ ] A read-only key cannot create anything, and a key for one workspace cannot reach another.
- [ ] Tool descriptions and results are tested against injection attempts.

**Learn:** the MCP protocol from the server side, tool design for models, and the security model of connecting AI clients to your data. Check the current MCP specification and SDK documentation before starting.

## 13. Appendix

### Starting Phase 1

1. Export this document as Markdown and save it in a new Git repository as `docs/spec/SPEC.md`.
2. Start Claude Code in that repository and ask it to split the file into one file per phase (`docs/spec/phase-1.md` and so on) plus `docs/spec/overview.md`. Smaller files keep each session's context focused.
3. Create `CLAUDE.md` from the starter in section 3.
4. Give Claude Code this kickoff prompt:

```
Read docs/spec/overview.md and docs/spec/phase-1.md. Do not write code yet.
1. Summarize Phase 1 in your own words.
2. List every ambiguity, missing decision or risk you see.
3. Propose the monorepo scaffold and the order of work as a plan I can approve.
Wait for my answers before implementing anything.
```

### Data model by phase

| Phase | New tables |
| --- | --- |
| 1 | users, workspaces, workspace\_members, invites, projects, tasks |
| 2 | documents, document\_versions, uploads, task\_document\_links |
| 3 | document\_snapshots, document\_updates |
| 4 | resource\_grants, share\_links, audit\_events |
| 5 | document\_chunks, outbox\_events, processed\_events, comments, notifications, notification\_preferences, export\_jobs |
| 6 | api\_keys, idempotency\_keys, webhook\_endpoints, webhook\_deliveries |
| 7 | ai\_conversations, ai\_messages, ai\_proposals, ai\_runs, ai\_usage\_daily, workspace\_settings |

### Phase retrospective template

Copy this into `docs/retros/phase-N.md` at the end of every phase.

```markdown
# Phase N retrospective

Dates: <start> to <end>. Actual effort: <hours> (estimate: <hours>).

## What shipped

## Acceptance criteria
Passed, failed or changed, with reasons.

## Decisions
Links to the ADRs written this phase.

## Where Claude Code helped most

## Where Claude Code got it wrong
For each: what it did, how I caught it, the fix, and how to prevent it next time.

## What I could not have written myself
Topics to study, and the exercises I added.

## Security and quality findings
Found, fixed and deferred (from the review checklist).

## CLAUDE.md changes

## Risks for the next phase
```

### Reading list

Use each tool's official documentation as the primary source and check it at the start of the phase that uses it.

- **Editor and real-time:** ProseMirror guide, TipTap docs, Yjs docs and internals, Hocuspocus docs.
- **Data and search:** PostgreSQL docs (full-text search, row-level security, indexes), pgvector, Drizzle ORM, BullMQ.
- **APIs and security:** OpenAPI 3.1 specification, RFC 9457 (problem details), the OWASP Top 10 and OWASP Cheat Sheet Series.
- **AI and Claude Code:** Claude Code documentation (CLAUDE.md, hooks, subagents, MCP, headless mode), Anthropic API documentation (tool use, streaming, prompt caching), Anthropic's guidance on building effective agents, the Model Context Protocol specification.
- **Operations:** k6 docs, OpenTelemetry docs, the Google SRE book.
- **Books:** Martin Kleppmann, *Designing Data-Intensive Applications*, as a companion for Phases 3, 5 and 8.
