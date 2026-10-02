# 7. Phase 4: Permissions and audit log

Phase 4 replaces the simple owner and member roles with real access control, adds sharing, and records every important action in an append-only audit log. Most serious security bugs in collaborative software are authorization bugs, so this phase is as much about proving access rules as writing them.

### Concepts

RBAC versus per-resource ACLs, permission inheritance, a single policy choke point, defense in depth with Postgres row-level security (RLS), append-only audit logging, authorization test matrices, insecure direct object references (IDOR).

### Scope

- **Workspace roles:** owner, admin, member and guest. A guest sees only what is explicitly shared with them.
- **Resource permissions:** per-project and per-document grants at four levels (view, comment, edit, manage). Grants inherit down the document tree, and a document can break inheritance.
- **Central policy module:** one function, `can(actor, action, resource)`, called by every route, job and WebSocket message. No ad hoc role checks anywhere else.
- **Sharing:** a share dialog, guest invites for a single document, and optional public view-only links that can expire and be revoked.
- **Row-level security:** Postgres RLS on every tenant-owned table as a second layer, driven by a workspace setting applied with `SET LOCAL` inside each transaction. The application connects with a role that is neither superuser nor table owner.
- **Audit log:** an append-only `audit_events` table written in the same transaction as the change it records, with a workspace-wide activity feed, a per-document feed and an admin view with CSV export.
- **Undo:** an undo toast for archive and delete actions. Undo is a new event, never a deletion of history.
- **Live enforcement:** permission changes take effect on open WebSocket connections within 5 seconds (disconnect or downgrade to read-only).
- **Optional stretch:** make the audit log tamper-evident by storing each event's hash chained to the previous one.

### Data model

| Table | Key columns |
| --- | --- |
| workspace\_members | `role` expands to owner, admin, member or guest |
| resource\_grants | id, workspace\_id, resource\_type (project or document), resource\_id, user\_id, level (view, comment, edit or manage), created\_by, created\_at, expires\_at |
| documents, projects | add `inherit_permissions` (boolean, default true) |
| share\_links | id, workspace\_id, resource\_type, resource\_id, token\_hash, level (view only), expires\_at, revoked\_at, created\_by |
| audit\_events | id, workspace\_id, actor\_type (user, api\_key, system or agent), actor\_id, action, resource\_type, resource\_id, metadata (jsonb), ip, user\_agent, request\_id, created\_at |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET, PUT, DELETE .../documents/:documentId/permissions` | Read and change grants |
| `POST, DELETE .../documents/:documentId/share-links` | Create and revoke public links |
| `GET /s/:token` | Public read-only view of a shared document |
| `GET /workspaces/:workspaceId/activity` | Activity feed (cursor pagination, filtered by what the caller can see) |
| `GET /workspaces/:workspaceId/audit-events` | Admin audit query by actor, action, resource and date |
| `GET /workspaces/:workspaceId/audit-events/export.csv` | Admin export |

### Acceptance criteria

- [ ] A permission matrix (role × level × action × resource type) lives in the docs, and an automated test generated from it passes for every cell.
- [ ] A test fails the build if any route or WebSocket handler does not call the policy module.
- [ ] Guests cannot see unshared items anywhere: tree, search, mentions, activity or counts.
- [ ] Sharing a parent grants access to its children, and breaking inheritance hides them.
- [ ] Removing a user's access disconnects them or makes them read-only within 5 seconds.
- [ ] Public links are view-only, honor expiry and revocation, store only a hash of the token, and every visit is logged.
- [ ] With RLS on, a deliberately broken query missing its workspace filter still returns no rows from other workspaces.
- [ ] Every mutating action writes an audit event in the same transaction, and a failed audit insert rolls the change back.
- [ ] The application's database role cannot UPDATE or DELETE audit events, proven by a test.
- [ ] The last owner of a workspace cannot be removed or demoted, and a member cannot promote themselves.
- [ ] Undoing an archive restores the document and records both events.

### Claude Code tasks

1. In plan mode, design the permission model and write an ADR (RBAC plus resource grants plus inheritance). Produce the permission matrix as a table in `docs/`.
2. Create three subagents in `.claude/agents/`: a reviewer, a test-writer and a security-auditor, each with narrow instructions and read-only tools where possible.
3. Have the test-writer subagent generate the matrix tests from your table, then review them yourself.
4. Implement the policy module, refactor every route and socket handler to use it, and have the reviewer subagent confirm no ad hoc checks remain.
5. Add the RLS migrations and the per-transaction workspace context, and create the separate migration and application database roles.
6. Implement audit events through one transaction helper, then the feed and admin views.
7. Run the security-auditor subagent against the finished phase and log every finding.

### Review checklist

- [ ] Every ID in a path or body is checked to belong to the caller's workspace and to be accessible to the caller (no IDOR).
- [ ] List endpoints filter by permission in SQL, not in memory afterward, so counts and pagination do not leak.
- [ ] Share tokens have high entropy, are compared in constant time and are rate limited.
- [ ] Audit events hold IDs and metadata only, never secrets or full document content.
- [ ] The application role does not own the tables and cannot bypass RLS.
- [ ] `SET LOCAL` is used so workspace context cannot leak between pooled connections.

### Learning exercises

- Draw the permission-resolution steps on paper (workspace role, then grant, then inheritance) and compare them with your code line by line.
- Try to bypass RLS through connection pooling or a missing context, then write down what you learned.
- Write a page comparing RBAC, ABAC and relationship-based access control (Zanzibar style), and say when Tandem would outgrow its model.
- Run a mock penetration test on your own app and keep a findings log with severity and fix.

