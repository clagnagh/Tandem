# 5. Phase 2: Documents

Phase 2 adds nested rich-text documents with autosave and version history, still for one editor at a time. Concurrent edits are deliberately handled badly (a stale save is rejected) so that you feel the problem Phase 3 solves.

### Concepts

Rich-text editor architecture (ProseMirror schema, transactions), autosave and debouncing, optimistic concurrency control, immutable version snapshots, tree structures in SQL, file uploads with presigned URLs, XSS defense.

### Scope

- **Documents:** create, rename, move, archive and restore (soft delete). Documents nest under a parent and appear in a sidebar tree.
- **Editor:** TipTap with headings, bold, italic, underline, bullet, numbered and task lists, code blocks, links, tables, images, a slash-command menu and Markdown shortcuts.
- **Autosave:** debounced save about one second after typing stops, with a visible status (Saving, Saved, Error, Offline) and retry with backoff.
- **Optimistic concurrency:** every save sends the `baseVersion` it started from. If the server has a newer version, it returns 409 and the UI offers to reload or copy local changes.
- **Version history:** automatic snapshot at most every 5 minutes of activity, plus a manual Save version. Users can list versions, view one read-only, compare it with the current text and restore it. Restoring creates a new version and never deletes history.
- **Task links:** an `@task` mention inside a document that shows the task's live status and links to the board.
- **Images:** upload through presigned URLs to S3-compatible storage (MinIO locally).
- **Export:** download a document as Markdown or HTML.

### Data model

Store content as ProseMirror JSON. In Phase 3 you will migrate it to Yjs state, which is a deliberate data-migration exercise.

| Table | Key columns |
| --- | --- |
| documents | id, workspace\_id, parent\_id (nullable), title, content (jsonb), content\_text, version, created\_by, updated\_by, created\_at, updated\_at, archived\_at |
| document\_versions | id, workspace\_id, document\_id, version, title, content (jsonb), reason (auto, manual or restore), created\_by, created\_at |
| uploads | id, workspace\_id, document\_id, storage\_key, mime\_type, size\_bytes, created\_by, created\_at |
| task\_document\_links | workspace\_id, task\_id, document\_id; primary key (task\_id, document\_id) |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `GET /workspaces/:workspaceId/documents/tree` | Sidebar tree (ids, titles, parents only) |
| `POST /workspaces/:workspaceId/documents` | Create a document |
| `GET, PATCH /workspaces/:workspaceId/documents/:documentId` | Read; save with `baseVersion` (409 on mismatch) |
| `POST .../documents/:documentId/move` | Change parent (rejects cycles) |
| `POST .../documents/:documentId/archive` and `/restore` | Soft delete and undo |
| `GET .../documents/:documentId/versions` and `/versions/:version` | List and read versions |
| `POST .../documents/:documentId/versions/:version/restore` | Restore as a new version |
| `POST /workspaces/:workspaceId/uploads/presign` and `/uploads/:uploadId/complete` | Two-step image upload |
| `GET .../documents/:documentId/export?format=md` or `html` | Export |

### Acceptance criteria

- [ ] Documents can be nested, moved and archived, and moving a document under its own descendant is rejected.
- [ ] Edits autosave within about two seconds of the last keystroke, and the status indicator is accurate.
- [ ] Closing the tab right after typing does not lose the last edit (flush on page hide).
- [ ] A failed save retries with backoff, then shows an error, and local content is never discarded.
- [ ] With the same document open in two browsers, the second save gets a 409 and nothing is silently overwritten.
- [ ] Automatic and manual versions appear in history, any version can be viewed read-only, and restoring creates a new version.
- [ ] Images upload only if they are an allowed type and at most 5 MB, and cannot be fetched by users outside the workspace.
- [ ] An `@task` mention shows the task's current status and updates when the task changes.
- [ ] Pasting hostile HTML (script tags, event handlers, `javascript:` links) cannot execute code, proven by a test.
- [ ] Exporting to Markdown preserves headings, lists, code blocks and links.

### Claude Code tasks

1. In plan mode, ask for options for content storage (ProseMirror JSON, HTML or Markdown) and write the ADR with your choice.
2. Write migrations and failing tests for the document tree, including cycle prevention.
3. Write failing tests for optimistic concurrency and version snapshots, then implement the documents API.
4. Build the editor and an autosave hook, testing the hook with fake timers (typing bursts, failures, offline).
5. Add MinIO to Docker Compose and implement presigned uploads with workspace-scoped storage keys.
6. Turn the finished module into a `/new-module` slash command so later phases start from the same pattern.

### Review checklist

- [ ] Stored content is validated against the editor schema, and links are limited to http, https and mailto.
- [ ] Version and upload endpoints check workspace membership themselves, not just the document endpoint.
- [ ] Presigned URLs expire quickly, enforce content type and size, and use keys that include the workspace ID.
- [ ] Autosave can neither resurrect an archived document nor overwrite a newer version.
- [ ] Request size limits exist, and the growth of the versions table is estimated and noted.

### Learning exercises

- Read the ProseMirror guide on schemas and transactions, then explain how one keystroke becomes a state change.
- Reproduce a lost update by temporarily disabling the version check, then explain exactly how the 409 prevents it.
- Measure version storage for a long document edited for an hour and propose a compaction strategy.
- Write a small text diff yourself, then compare it with a library's result.
- Write an ADR on storing content as JSON versus Markdown.

