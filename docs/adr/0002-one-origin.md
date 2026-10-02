# 2. The browser talks to one origin

Date: 2026-10-02. Status: Accepted. Spec: phase-1 question 1.

## Context

The web app (Next.js, port 3000) and the API (Fastify, port 4000) are
separate processes. If the browser called both, we would need CORS, cookies
that work across origins, and a weaker CSRF story.

## Options

1. **Browser calls Fastify directly** on another origin or subdomain. Needs
   CORS with credentials and careful cookie domains.
2. **Next.js forwards `/api/*` to Fastify** with a rewrite. The browser sees
   one origin.
3. **Put a reverse proxy (Caddy, nginx) in front of both.** Same result as 2,
   with one more service to run.

## Decision

Option 2. `apps/web/next.config.ts` rewrites `/api/:path*` to `API_ORIGIN`.
Server components may call `API_ORIGIN` directly from the server side.

## Consequences

- Cookies are first-party, so `SameSite=Lax` does real work (see ADR 0004).
- No CORS configuration in Phase 1.
- Fastify sees requests coming from Next.js, so the client IP arrives in
  `X-Forwarded-For`. The login rate limit (per IP) must trust that header
  only from the web process. Step 4 configures Fastify's `trustProxy`.
- WebSockets in Phase 3 need a decision: the rewrite may not carry them, so
  that phase may move to option 3.
