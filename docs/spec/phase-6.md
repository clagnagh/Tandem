# 9. Phase 6: Public API and webhooks

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

