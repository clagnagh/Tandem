# 12. Stretch phases

These are optional, independent of each other, and best attempted after Phase 8. Each follows the same loop from section 3: spec, plan, tests first, review, explain, retrospective.

### Stretch A: Offline-first sync

**Goal:** Tandem stays usable with no connection and reconciles cleanly afterward.

- Persist Yjs documents in IndexedDB so recent documents open and edit offline.
- Add a service worker so the app shell loads offline and the app is installable.
- Queue task changes made offline as mutations with idempotency keys and replay them on reconnect.
- Choose and document a conflict policy for tasks (for example field-level last-writer-wins using server timestamps) and show a sync status indicator.

**Acceptance criteria**

- [ ] With the network off for 10 minutes, a user can open recent documents, edit them and create and move tasks.
- [ ] After reconnecting, all changes merge with no duplicates, even if the connection drops again mid-sync.
- [ ] The task conflict policy is written down and covered by tests for simultaneous edits to the same field and to different fields.

**Learn:** local-first design, service workers, client-side persistence, idempotent replay, conflict policies beyond CRDTs.

### Stretch B: Automations and sandboxed scripts

**Goal:** Let workspaces extend Tandem safely.

- A rules engine: trigger (an event), conditions, then actions (for example: when a task moves to Done, add a comment and call a webhook). Rules are stored as validated JSON and run by the worker from the outbox.
- Loop prevention: events caused by automations are tagged with their origin, and chains stop at a maximum depth.
- Optional custom scripts: run user-supplied JavaScript in an isolate (an isolated VM or a WebAssembly JavaScript runtime) with CPU, memory and time limits, no network or file access, and a small explicit host API.
- A run log per rule and per-workspace execution limits.

**Acceptance criteria**

- [ ] A rule that would trigger itself forever is stopped and logged.
- [ ] A script containing an infinite loop is killed within its time limit and cannot affect other jobs.
- [ ] A script cannot read environment variables, files or the network, proven by tests that try each.
- [ ] Every automated action appears in the audit log with actor type `automation`.

**Learn:** rules engines, sandboxing and its limits, resource quotas. Treat the script feature as the riskiest in the project: write its threat model before any code and have the security-auditor subagent attack it.

### Stretch C: Tandem as an MCP server

**Goal:** Let Claude Code or Claude Desktop use a Tandem workspace directly through the Model Context Protocol.

- Build an MCP server (in `apps/mcp`) that authenticates with a Phase 6 API key and exposes tools for search, reading documents, listing and creating tasks.
- Enforce key scopes on every tool, and record the key as the actor in the audit log.
- Treat tool results as untrusted content, as in Phase 7.

**Acceptance criteria**

- [ ] Claude Code, configured with the server, can search the workspace and create a task.
- [ ] A read-only key cannot create anything, and a key for one workspace cannot reach another.
- [ ] Tool descriptions and results are tested against injection attempts.

**Learn:** the MCP protocol from the server side, tool design for models, and the security model of connecting AI clients to your data. Check the current MCP specification and SDK documentation before starting.

