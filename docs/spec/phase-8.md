# 11. Phase 8: Production hardening

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

