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
