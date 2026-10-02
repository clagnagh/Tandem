# 8. Phase 5: Search and background jobs

Phase 5 adds permission-aware keyword, semantic and hybrid search, comments, notifications and a real worker process with a reliable event pipeline. Search ranks results over data each user may see, while the worker teaches you how to make work that can fail, retry and run twice still come out correct.

### Concepts

Postgres full-text search (tsvector, GIN, ranking, trigrams), embeddings and vector search (pgvector, HNSW), chunking, hybrid ranking with reciprocal rank fusion, job queues, retries and dead-letter queues, idempotency, the transactional outbox pattern, scheduled jobs.

### Scope

- **Worker app:** `apps/worker` with BullMQ queues named `index`, `embed`, `notify`, `email` and `export`, plus an admin-only page showing failed jobs with a retry button.
- **Transactional outbox:** domain events are written to `outbox_events` in the same transaction as the change. A dispatcher publishes them to queues, giving at-least-once delivery. Every consumer is idempotent.
- **Keyword search:** generated `tsvector` columns on documents and tasks (title weighted higher than body), GIN indexes, ranked results with highlighted snippets, typeahead suggestions, and typo tolerance with `pg_trgm`.
- **Semantic search:** split documents into chunks of roughly 500 tokens along heading boundaries, embed them in a job, store vectors in pgvector with an HNSW index, and re-embed only chunks whose content hash changed.
- **Hybrid search:** merge keyword and vector rankings with reciprocal rank fusion. Filters for type, project, assignee and date. Permissions are applied inside the SQL using the Phase 4 grants.
- **Comments:** threaded comments on tasks and documents, with `@user` mentions. Posting a comment requires the comment permission level from Phase 4.
- **Notifications:** in-app (bell icon, unread count, live over WebSocket) and email, triggered by task assignment, mentions, replies and tasks due within 24 hours. Per-user preferences per event type, signed one-click unsubscribe links, and a daily digest email.
- **Export and import:** a background job exports a workspace as a ZIP of Markdown and JSON with progress reporting, and an import job reads the same format back.

### Data model

| Table | Key columns |
| --- | --- |
| documents, tasks | add `search_vector` (tsvector) with a GIN index |
| document\_chunks | id, workspace\_id, document\_id, chunk\_index, text, content\_hash, embedding (vector), created\_at; HNSW index on `embedding` |
| outbox\_events | id, workspace\_id, type, payload (jsonb, IDs only), created\_at, dispatched\_at |
| processed\_events | consumer, event\_id, processed\_at; primary key (consumer, event\_id) |
| comments | id, workspace\_id, resource\_type (task or document), resource\_id, parent\_id, author\_id, body, created\_at, edited\_at, deleted\_at |
| notifications | id, workspace\_id, user\_id, type, payload, read\_at, created\_at |
| notification\_preferences | user\_id, event\_type, in\_app (boolean), email (boolean) |
| export\_jobs | id, workspace\_id, requested\_by, status, progress, storage\_key, expires\_at |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET /workspaces/:workspaceId/search?q=&type=&mode=keyword, semantic or hybrid&cursor=` | Search |
| `GET /workspaces/:workspaceId/search/suggest?q=` | Typeahead |
| `GET, POST .../tasks/:taskId/comments` and `.../documents/:documentId/comments` | List and add comments |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | Notification inbox |
| `GET, PUT /notification-preferences` | Preferences |
| `GET /unsubscribe/:signedToken` | One-click unsubscribe without login |
| `POST /workspaces/:workspaceId/exports`, `GET .../exports/:exportId` | Start and poll an export |
| `POST /workspaces/:workspaceId/imports` | Start an import |

### Acceptance criteria

- [ ] On a seeded dataset of 10,000 documents and 50,000 tasks, keyword search returns ranked, highlighted results in under 100 ms at the 95th percentile.
- [ ] Typo tolerance works: "retrospectve" finds "retrospective".
- [ ] Semantic search finds a document by meaning when it shares no keywords with the query, shown by a curated set of test cases.
- [ ] Search never returns anything the caller cannot access, tested with guests and revoked grants.
- [ ] Editing a document re-indexes it within 10 seconds, and only changed chunks are re-embedded (verified by a counter).
- [ ] Killing the worker mid-job and restarting completes the work, and duplicate delivery produces exactly one notification and one email.
- [ ] Failed jobs retry with exponential backoff and jitter, then land in a dead-letter queue visible and retryable from the admin page.
- [ ] If the server crashes right after a transaction commits, the domain event is still delivered (outbox test).
- [ ] Assignment, mention, reply and due-soon events each create an in-app notification (with live unread count) and an email according to preferences.
- [ ] The daily digest sends one email per user even across worker restarts, and unsubscribe links work without login and cannot be forged.
- [ ] Exporting a 1,000-document workspace runs in the background with visible progress, and importing the result restores the content.
- [ ] Embedding calls are batched and rate limited, and token counts are logged per workspace.

### Claude Code tasks

1. In plan mode, write ADRs for the outbox versus direct queue publishing, and for the chunking strategy.
2. Connect a read-only Postgres MCP server and the Playwright MCP server. Use Postgres to run `EXPLAIN ANALYZE` on real queries, and use Playwright to check the search and notification UI.
3. Build the worker skeleton and write failing idempotency and outbox tests first.
4. Add the full-text migration and confirm with `EXPLAIN` that the GIN index is used.
5. Build the chunker (with unit tests), the embedding job and a deterministic fake embedding provider so CI stays offline and free.
6. Implement hybrid ranking and a relevance test set of about 30 queries with expected top results. This is your first mini evaluation suite.
7. Work on search and notifications in two parallel git worktrees, then merge.

### Review checklist

- [ ] Every job handler validates its payload, is idempotent and receives IDs, not document content or secrets.
- [ ] User search text goes through `websearch_to_tsquery`, never string concatenation, and all SQL is parameterized.
- [ ] Permission filtering happens inside the query, before ranking and pagination.
- [ ] Retries use backoff with jitter, poison messages go to the dead-letter queue, and fan-out is rate limited.
- [ ] Emails escape user content and always include unsubscribe.
- [ ] Sending document text to an embedding provider is documented in an ADR, with a per-workspace opt-out.
- [ ] A cleanup job removes dispatched outbox rows and old processed-event records.

### Learning exercises

- Run `EXPLAIN ANALYZE` before and after adding the GIN and HNSW indexes and record the timings.
- Explain at-least-once versus exactly-once delivery, and why idempotent consumers are the practical answer.
- Try three chunk sizes and compare relevance on your test set.
- Crash the worker at each step of a job on purpose and document every failure mode you find.
- Write a page on when you would replace Postgres search with a dedicated engine such as Meilisearch or Elasticsearch.

