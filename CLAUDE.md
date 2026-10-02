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
