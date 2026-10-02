# 7. Real Postgres in tests: local server or container

Date: 2026-10-02. Status: Accepted. Spec: phase-1 question 16.

## Context

Integration tests must use a real Postgres (the spec names Testcontainers).
Claude Code cloud sessions have Postgres 16 and Redis 7 installed but no
Docker daemon, so Testcontainers cannot start containers there.

## Decision

`createTestDatabase()` in `packages/db/src/testing.ts`:

- If `TEST_DATABASE_URL` is set, it creates a fresh, randomly named database
  on that server for each test file and drops it afterwards.
- Otherwise it starts `pgvector/pgvector:pg16` with Testcontainers.

CI and your own machine (with Docker) use containers. Cloud sessions use the
local server; `.claude/hooks/session-start.sh` starts it and sets
`TEST_DATABASE_URL`.

## Consequences

- Tests behave the same either way: every test file gets an empty, migrated
  database of its own, so files can run in parallel.
- The local server is Postgres 16 without pgvector. Phase 5 will need the
  extension installed in cloud sessions, or the semantic search tests will
  have to run in CI only.
