# 6. Phase 3: Real-time

Phase 3 lets several people edit the same document at once, with live cursors and presence, and makes the task board update live for everyone. This is the hardest phase technically, and the one where Claude Code's output needs the most scrutiny.

### Concepts

WebSockets, CRDTs (Yjs), the Yjs sync and awareness protocols, persisting an update log, reconnection and offline merging, horizontal scaling with Redis pub/sub, authenticating a long-lived connection.

### Scope

- **Yjs migration:** documents move from ProseMirror JSON to Yjs state. A one-time script converts every existing document. The JSON `content` column stays as a derived cache so export, versions and later search keep working.
- **Sync server:** Hocuspocus on the server, with authentication when the connection opens (session cookie, workspace membership and access to the document).
- **Persistence:** store incoming updates in an append-only log, and compact the log into one snapshot when it passes 100 updates or after a few idle minutes.
- **Presence:** live cursors and selections with names and colors, plus an avatar list of who is in the document.
- **Versions:** version history now snapshots the Yjs state and the derived JSON. The Phase 2 409 flow for documents is removed.
- **Reconnection:** automatic reconnect with backoff, a connection status indicator, and edits made offline merging on reconnect.
- **Live board:** a separate JSON-event channel per project broadcasts task created, updated, moved and deleted events. This is a plain server-authoritative design, so you can compare it with the CRDT approach.
- **Scaling out:** run two server instances behind a reverse proxy locally, with Redis pub/sub carrying updates between them.

### Data model

| Table | Key columns |
| --- | --- |
| document\_snapshots | document\_id (primary key), workspace\_id, state (bytea), updated\_at |
| document\_updates | id (bigserial), workspace\_id, document\_id, update (bytea), created\_at; rows are deleted when compacted into a snapshot |
| documents | `content` becomes derived from the Yjs state; `version` now counts snapshots |

### Interfaces

| Endpoint | Purpose |
| --- | --- |
| `WS /ws/documents/:documentId` | Yjs sync and awareness; authenticated on upgrade |
| `WS /ws/projects/:projectId` | JSON events for the live board |

Board messages use one envelope, defined with Zod in `packages/shared`: `{ type, workspaceId, projectId, seq, payload }`. Types are `task.created`, `task.updated`, `task.moved` and `task.deleted`. Clients ignore any event whose `seq` is older than what they have already applied.

### Acceptance criteria

- [ ] Typing in one browser appears in another within about 200 ms on a local network.
- [ ] A scripted test with at least 5 simulated clients making random concurrent edits, with random delays and reordering, always converges to identical documents.
- [ ] Live cursors show name and color, the presence list updates on join and leave, and a dropped client disappears within 30 seconds.
- [ ] A user without access cannot open a connection, and a user removed from the workspace is disconnected within 10 seconds.
- [ ] Restarting the server during a session causes automatic reconnection with no lost edits.
- [ ] With two server instances, users connected to different instances see each other's edits.
- [ ] Edits made during 60 seconds offline merge cleanly on reconnect.
- [ ] After all clients leave and the server restarts, the document is intact, and the update log compacts as specified.
- [ ] Every Phase 2 document is migrated without content loss, verified by comparing Markdown exports before and after.
- [ ] Moving a card in one browser moves it in another within 1 second, with no duplicates or flicker.
- [ ] Oversized messages are rejected and each connection is rate limited.

### Claude Code tasks

1. In plan mode, compare Hocuspocus, a custom `ws` server with `y-protocols`, and a hosted option. Write the ADR.
2. Define the message types in `packages/shared` first, then use two git worktrees in parallel: one session for the server sync layer, one for the editor client bindings.
3. Write the JSON-to-Yjs migration script with a verification test that compares exports.
4. Build the convergence test harness (simulated clients, delays, reordering) before writing the persistence code.
5. Implement persistence and compaction, then Redis pub/sub, then a Docker Compose setup with two server instances and a proxy.
6. Add the live board channel with `seq` handling and tests for out-of-order delivery.

### Review checklist

- [ ] WebSocket authentication runs on upgrade, the `Origin` header is checked (cross-site WebSocket hijacking), and access is re-checked when membership changes.
- [ ] Awareness data such as names and colors is treated as untrusted input and sanitized before rendering.
- [ ] Message size, per-connection rate and update-log growth all have limits.
- [ ] Listeners and timers are cleaned up, with no memory growth after 1,000 connect and disconnect cycles.
- [ ] Redis channel names include the workspace ID, and a client cannot subscribe to another workspace's channel.
- [ ] Board events are idempotent and safe to receive twice or out of order.

### Learning exercises

- Explain in your own words why two concurrent inserts at the same position converge in Yjs, using the Yjs internals documentation.
- Build a last-write-wins text field and show a scenario where it loses data while Yjs does not.
- Throttle the network in browser devtools, watch reconnection and write down what you observe.
- Measure update-log growth with and without compaction.
- Write half a page comparing CRDTs with operational transform.

