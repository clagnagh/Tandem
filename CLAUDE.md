# Tandem

Real-time collaborative workspace (docs, tasks, AI agent). This is a learning
project: correctness and understanding matter more than speed.

## Stack

TypeScript (strict), pnpm monorepo, Next.js, Fastify, Postgres + Drizzle,
Redis + BullMQ, Yjs, Vitest, Playwright.

## Commands

- docker compose up -d: Postgres, Redis and Mailpit (http://localhost:8025)
- pnpm dev: web on :3000 and server on :4000 (the worker arrives in Phase 5)
- pnpm typecheck, pnpm lint, pnpm format
- pnpm test: unit tests (`*.test.ts`)
- pnpm test:integration: real Postgres and Redis (`*.int.test.ts`); uses
  TEST_DATABASE_URL and TEST_REDIS_URL if set, otherwise Testcontainers
- SHOW_PENDING=1 pnpm test:integration: run pending tests as normal tests to
  see why they fail
- pnpm test:e2e: Playwright main flow in a real browser (apps/web/e2e); needs
  Postgres, Redis and Mailpit running, and starts the server and web app
  itself. Cloud sessions: the session-start hook builds and starts Mailpit and
  sets PW_CHROMIUM_PATH (never run `playwright install` there)
- pnpm db:generate: write migration SQL from the Drizzle schema, then add
  the matching `.down.sql` by hand
- pnpm db:migrate, pnpm db:rollback, pnpm db:seed
- Cloud sessions have no Docker: .claude/hooks/session-start.sh starts the
  local Postgres, Redis and Mailpit instead

## Architecture rules

- Modular monolith: apps/server/src/modules/<name> with routes, service,
  repository, tests. Modules talk through services, never repositories.
- Every tenant-owned table has workspace_id; every repository function takes it.
- Postgres is the source of truth. Redis is disposable.
- Validate every request, job and socket message with Zod schemas from
  packages/shared.
- Side effects (email, webhooks, indexing) go through the queue.
- Every migration is reversible: each `migrations/NNNN_name.sql` has a
  `NNNN_name.down.sql`. Never use drizzle-kit migrate or push.
- The browser only talks to Next.js; /api/* is forwarded to Fastify.
- Routes that need a signed-in user register inside the protected plugin in
  apps/server/src/app.ts (requireSession); use currentUser(request). Every
  /api/v1 route needs a case in tests/isolation.int.test.ts or CI fails.
- Services throw AppError subclasses (apps/server/src/errors.ts); the central
  error handler turns them into `{ error: { code, message, requestId } }`.
- Node runs the TypeScript directly: relative imports end in `.ts`, and only
  erasable syntax (no enum, no namespace).
- Task positions are fractional-index keys computed by the server, in a
  `COLLATE "C"` column.
- Web app: pages call the API through apps/web/lib/api.ts (typed with
  packages/shared/src/dto.ts). Board logic lives in pure functions in
  apps/web/lib/board.ts with unit tests in apps/web/tests. Before using a
  Next.js API, read node_modules/next/dist/docs (Next 16 differs from older
  versions).

## Workflow rules

- Read docs/spec/phase-N.md first. Ask about ambiguity before coding.
- Use plan mode for any change touching more than 3 files.
- Write failing tests first. Never edit a test to make it pass unless the test
  is wrong, and say so when you do.
- Tests for unbuilt behaviour use `pendingIt` (apps/server/tests/support/
  pending.ts), named "[step N] ...". CI stays green while they fail and goes
  red once they pass: then change `pendingIt` to `it`, nothing else.
- Server integration tests talk HTTP only (tests/support/http.ts): real
  sign-up, cookies, Origin header, client IP in X-Forwarded-For.
- Small commits, one per green slice, conventional commit messages.
- Never run destructive commands (drop, reset --hard, rm -rf) without asking.
- Never commit secrets. Use .env.example; .env is gitignored.
- Record significant decisions in docs/adr (index in docs/adr/README.md).
- Hooks: typecheck and lint run after every edit; destructive shell commands
  are blocked until the user agrees.

## Code conventions

- No any. No non-null assertions without a comment explaining why.
- Typed AppError classes for errors; never throw strings.
- Log with pino, never console.log.
- Prefer boring, readable code over clever code.
