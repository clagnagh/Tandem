# 9. Login rate limiting in Redis

Date: 2026-10-07. Status: Accepted. Spec: phase-1 acceptance criterion
"Login is rate limited to 5 attempts per minute per IP and email, using
Redis", and question 5.

## Context

Password guessing has two shapes: many passwords against one account (from
many IPs), and one password against many accounts (from one IP). Better
Auth has a limiter, but it keeps counts in each process's memory, keys them
by IP only, and is switched off outside production, so tests would not
exercise what production runs.

## Options

1. **Better Auth's limiter with Redis as secondary storage.** Still keyed by
   IP only, so it misses the "one account from many IPs" attack.
2. **Our own fixed-window counters in Redis**, one per IP and one per email.
3. **A sliding window or token bucket.** Smoother at the window edges, more
   code. Phase 6 compares the algorithms for the public API.

## Decision

Option 2. Before Better Auth sees `POST /api/v1/auth/sign-in/email`, a
Fastify pre-handler counts the attempt against `login:ip:<ip>` and
`login:email:<email>` with one Lua script, so the increments and expiries
are atomic across server instances. Each counter lives 60 seconds from its
first attempt. Every attempt counts, right or wrong. Over 5 on either
counter answers 429 with `Retry-After`. Better Auth's own limiter is off.

The client IP is Fastify's `request.ip`, which honours `X-Forwarded-For`
only from `TRUSTED_PROXIES` (default `127.0.0.1,::1`, the Next.js server).
A client connecting directly cannot fake its IP with the header.

**If Redis is down, sign-in fails closed** with 503: without counters we
cannot stop guessing, and a short sign-in outage is safer than an
unlimited one. Existing sessions keep working because they do not touch
Redis.

## Consequences

- A user who mistypes five times waits up to a minute. The per-email
  counter also lets an attacker lock a known email out for a minute at a
  time; acceptable for a learning project, worth revisiting with a CAPTCHA
  or per-account backoff later.
- Fixed windows allow up to 10 attempts across a window boundary.
- Sign-up and password-reset requests are not rate limited yet. Note for
  a later phase: limit reset emails per address to stop email bombing.
- Integration tests cover both counters, the spoofed-header case and the
  Redis-down case.
