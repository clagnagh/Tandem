#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions, which have no Docker
# daemon. Starts the Postgres 16 and Redis 7 installed in the container,
# creates the dev database, installs dependencies and points integration
# tests at the local servers (docs/adr/0007). Does nothing on your own machine.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

pg_ctlcluster 16 main start 2>/dev/null || true
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null

for _ in $(seq 1 20); do
  pg_isready -q -h localhost && break
  sleep 0.5
done

su postgres -c "psql -q" <<'SQL'
ALTER USER postgres PASSWORD 'postgres';
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tandem') THEN
    CREATE ROLE tandem LOGIN PASSWORD 'tandem' CREATEDB;
  END IF;
END $$;
SQL
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname = 'tandem'\"" | grep -q 1 ||
  su postgres -c "createdb -O tandem tandem"

[ -f .env ] || cp .env.example .env
pnpm install --frozen-lockfile >/dev/null
pnpm -s db:migrate

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres' >> "$CLAUDE_ENV_FILE"
  echo 'export TEST_REDIS_URL=redis://localhost:6379' >> "$CLAUDE_ENV_FILE"
fi
