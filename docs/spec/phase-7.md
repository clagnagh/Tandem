# 10. Phase 7: AI agent

Phase 7 adds an assistant, Ask Tandem, that answers questions from a workspace's own content with citations and can propose actions such as creating tasks or editing documents. The agent runs with the asking user's permissions, never writes without approval, and is judged by an evaluation suite you build before the agent itself.

### Concepts

Retrieval-augmented generation (RAG), tool use and the agent loop, streaming responses, context window management, prompt caching, evaluation suites (golden sets, LLM-as-judge, regression gates), direct and indirect prompt injection, least-privilege tools, human-in-the-loop approval, cost budgets and LLM observability.

### Scope

- **Chat panel:** a sidebar with persisted conversations, streamed answers, a stop button, and citations that link to the exact document or task.
- **Read tools:** `search_workspace` (the Phase 5 hybrid search), `get_document` (whole or by section), `list_tasks` and `get_task`. Every tool call runs through the Phase 4 policy module as the asking user.
- **Write tools that need approval:** `create_task`, `update_task`, `add_comment` and `propose_document_edit`. A write tool never executes directly. It creates a proposal card showing the exact parameters (or a diff for edits), and the user presses Approve or Reject. Approved proposals run through the normal services and are audited with actor type `agent` acting on behalf of the user.
- **Agent loop:** bounded to 8 tool-call rounds, a token budget and a timeout. Tool errors go back to the model as error results. The model identifier is configuration, not code.
- **Built-in workflows:** summarize this document, draft tasks from this document (action items become proposals) and a weekly workspace summary run by a scheduled worker job.
- **Prompt injection defenses:** retrieved content is delimited and labeled as untrusted data. There are no network or web-fetch tools. Assistant output is sanitized so external images and links are not rendered (this blocks the markdown-image exfiltration trick). Writes require approval, and all tool arguments are validated with Zod.
- **Cost and safety controls:** per-user and per-workspace daily token budgets, prompt caching for the static system prompt and tool definitions, a workspace setting to turn AI off, and clear messages when a budget runs out.
- **Evaluation suite:** `packages/evals` with a seeded fixture workspace and four categories of cases (below), run in CI and nightly.
- **Observability:** one `ai_runs` record per request with model, token counts, cache hits, latency and tool calls (IDs and metadata, not document text, by default).

### Evaluation suite

| Category | What it checks | Example metric |
| --- | --- | --- |
| Retrieval | The right documents are found for 30 to 50 curated questions | recall@5, mean reciprocal rank |
| Answer quality | Answers are faithful to cited sources and complete | LLM-as-judge score on a rubric, plus deterministic checks (has a citation, every cited ID exists) |
| Tool use | The model picks the right tool with the right arguments, e.g. a request for a task due Friday yields a correct `create_task` proposal | Exact-match on tool name and key fields |
| Safety | At least 20 injection attacks hidden in documents, tasks and comments, plus permission probes | Zero unapproved writes, zero leaked data |

Model output varies, so run each case 3 times and judge by thresholds. Set thresholds after your first baseline run, except safety, which must be 100%. Check your LLM judge against about 20 human-labeled examples before trusting it.

### Data model

| Table | Key columns |
| --- | --- |
| ai\_conversations | id, workspace\_id, user\_id, title, created\_at |
| ai\_messages | id, conversation\_id, role, content (jsonb blocks), created\_at |
| ai\_proposals | id, workspace\_id, conversation\_id, user\_id, tool\_name, args (jsonb), status (pending, approved, rejected, expired or failed), result (jsonb), created\_at, decided\_at |
| ai\_runs | id, workspace\_id, user\_id, conversation\_id, model, input\_tokens, output\_tokens, cache\_read\_tokens, latency\_ms, tool\_calls (jsonb), status, created\_at |
| ai\_usage\_daily | workspace\_id, user\_id, date, input\_tokens, output\_tokens |
| workspace\_settings | add `ai_enabled` and `ai_daily_token_budget` |

### Interfaces

| Method and path | Purpose |
| --- | --- |
| `POST, GET /workspaces/:workspaceId/ai/conversations` | Create and list conversations |
| `POST .../ai/conversations/:conversationId/messages` | Send a message; the response is a server-sent event stream with text deltas, tool activity, proposals, done and error events |
| `POST .../ai/proposals/:proposalId/approve` and `/reject` | Decide a proposal |
| `GET /workspaces/:workspaceId/ai/usage` | Token usage by user and day |

### Acceptance criteria

- [ ] Answers to workspace questions include citations, and every cited ID is a real document or task the asker can access.
- [ ] Two users with different permissions asking the same question never receive content the other cannot see.
- [ ] No write executes without approval. Approving twice or double-clicking executes exactly once, and the audit log shows actor `agent` on behalf of the user.
- [ ] Streaming begins in under 3 seconds at the median on a typical query.
- [ ] A tool that always errors, or a prompt that induces endless tool calls, stops at 8 rounds with a graceful message.
- [ ] The evaluation suite has at least 50 cases across the four categories, the fast subset runs in CI on any change to prompts or tools, and the full suite runs nightly with results stored over time.
- [ ] Every injection fixture fails to trigger an unapproved action or data leak, including attempts to exfiltrate data through image or link URLs in the output.
- [ ] When a daily budget is exhausted the user sees a clear message, and a workspace with AI disabled makes no model calls (tested).
- [ ] The usage page shows tokens per user per day, and the cache hit rate is logged.
- [ ] You demonstrate once that a prompt change that drops an eval score below its threshold fails CI.
- [ ] Swapping the configured model needs no code change, and you have run the suite on at least two models and compared quality, latency and cost.

### Claude Code tasks

1. In plan mode, write ADRs comparing a single tool-using agent with a fixed workflow, and for the approval UX.
2. Build evaluation first: write the harness, the fixture workspace and the first 20 cases before the agent exists, then record a baseline using a deliberately naive prompt.
3. Implement each tool with a Zod schema and standalone tests, concentrating on permission checks.
4. Implement the agent loop with the official Anthropic TypeScript SDK, with streaming, bounded rounds and prompt caching. Check the current API documentation for model identifiers and caching behavior.
5. Build proposals and idempotent approval execution.
6. Write the injection attack fixtures first, then implement the defenses. Use a red-team subagent to invent new attacks, and triage what it produces.
7. Add observability and budgets.
8. Iterate on prompts using eval results, and log every change with its before and after scores in `docs/evals/log.md`.

### Review checklist

- [ ] Tools run as the asking user through the policy module, never through a service account, and no tool can widen access.
- [ ] The three risk conditions are never all present: private data, untrusted content and an outward channel. The outward channel is closed by design (no network tools, sanitized output).
- [ ] Retrieved text is labeled as data, the system prompt contains no secrets, and no tool can reach keys or credentials.
- [ ] Tool inputs are bounded in size, and every ID is checked against the workspace.
- [ ] Logs hold IDs and token counts by default, and logging full prompts is an explicit debug setting with a retention rule.
- [ ] API errors, rate limits and timeouts use backoff and show a clear message, and no failure leaves a partial write.
- [ ] `max_tokens` is always set, and context growth has a truncation or summarization strategy.
- [ ] The decision to send workspace content to a third-party model API is documented, with the workspace-level off switch.

### Learning exercises

- Run the same eval on two model sizes and write up the quality, latency and cost trade-off.
- Spend an hour trying to jailbreak your own agent. Record each attack that worked and its fix, then add it to the suite.
- Build "draft tasks from this document" both as an agent loop and as a fixed workflow, and compare accuracy and cost.
- Vary chunk size and the number of retrieved results and measure the effect on answer quality with your harness.
- Implement context truncation or summarization and measure what it does to answers at 80% of the context window.
- Read Anthropic's published guidance on building effective agents and compare it with your design choices.

