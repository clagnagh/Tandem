#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions, which have no Docker
# daemon. Starts the Postgres 16 and Redis 7 installed in the container,
# creates the dev database, installs dependencies, builds and starts Mailpit,
# and points integration tests at the local servers (docs/adr/0007). Does nothing on your own machine.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

pg_ctlcluster 16 main start 2>/dev/null || true
# No snapshots: this Redis is disposable, and saving would write dump.rdb
# into whatever directory the session started in.
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes --save '' --appendonly no >/dev/null

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

# Mailpit for the end-to-end test. GitHub release downloads are blocked here,
# but the Go module proxy is allowed, so build it from source once (about a
# minute) into a cache. Skipped quietly if Go is missing or the build fails.
MAILPIT_VERSION=v1.31.4
MAILPIT_BIN="$HOME/.cache/tandem/mailpit-$MAILPIT_VERSION"
if [ ! -x "$MAILPIT_BIN" ] && command -v go >/dev/null; then
  mkdir -p "$(dirname "$MAILPIT_BIN")"
  (cd /tmp && GOBIN="$HOME/.cache/tandem/gobin" go install "github.com/axllent/mailpit@$MAILPIT_VERSION" >/dev/null 2>&1 &&
    mv "$HOME/.cache/tandem/gobin/mailpit" "$MAILPIT_BIN") || true
fi
if [ -x "$MAILPIT_BIN" ] && ! curl -sf http://localhost:8025/api/v1/info >/dev/null; then
  (nohup "$MAILPIT_BIN" --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --disable-version-check >/dev/null 2>&1 &)
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres' >> "$CLAUDE_ENV_FILE"
  echo 'export TEST_REDIS_URL=redis://localhost:6379' >> "$CLAUDE_ENV_FILE"
  # Playwright here uses the preinstalled Chromium instead of downloading one.
  echo 'export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
