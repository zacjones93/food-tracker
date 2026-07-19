# Food Tracker AI Agent: Current-State Report and TanStack AI + Cloudflare Code Mode RFC

- Status: Proposed
- Date: 2026-07-19
- Scope: Web and iOS assistant, Cloudflare Worker runtime, D1-backed recipes/weeks, model and tool orchestration
- Decision owner: Product/engineering

## Executive summary

The assistant is not primarily failing because the model lacks an agent loop. It is failing because the model is given weak, misleading retrieval tools over inconsistent data.

The current implementation uses Vercel AI SDK v5 and Gemini 2.5 Flash inside a Next.js route deployed through OpenNext to Cloudflare Workers. It has authentication, D1 chat persistence, usage logging, four recipe tools, and two week tools. It does not use TanStack AI, Cloudflare AI Gateway, Cloudflare Agents SDK, or Code Mode.

The local corpus contains 520 recipes, 211 weeks, and 1,562 week-recipe relationships. Of the 520 recipes, 517 have the literal string `"null"` for `mealType`, 517 have `"null"` for `difficulty`, only 30 have usable tags, 407 have ingredient content, and 469 have recipe-body content. The current recipe search only searches `name`; its enum filters expect lowercase values that do not match most stored data. The current week tool claims to support date-range search but has no date inputs, and it applies name filtering only after limiting the D1 result set.

Code Mode is a good fit after the retrieval layer is repaired. It will let the model run a bounded, typed program that can search multiple terms, inspect candidates, compare weeks, filter results, and return only the useful subset in one model round trip. It will not make a name-only, post-limit search function intelligent.

The recommendation is:

1. Fix tenancy checks, data normalization, and search contracts first.
2. Adopt TanStack AI for the chat runtime, AG-UI event stream, typed tools, approvals, middleware, and React client.
3. Use Cloudflare's `@cloudflare/codemode/tanstack-ai` integration with `DynamicWorkerExecutor` and a Worker Loader binding for read-only recipe/week orchestration.
4. Keep mutating tools outside Code Mode and require explicit TanStack AI approval.
5. Route the current model through Cloudflare AI Gateway first, then select models using a Food Tracker retrieval benchmark.
6. Migrate web behind a feature flag, then update the native Swift client to consume AG-UI SSE events.

This should be treated as a retrieval and safety project with an AI-runtime migration inside it, not as a package swap.

## Part I: Current-state report

### Current architecture

```text
Web React useChat (@ai-sdk/react) ─┐
                                  ├─> Next route /api/chat
iOS buffers /api/mobile/assistant ┘        │
                                           ├─ auth + team access + daily request limit
                                           ├─ Gemini 2.5 Flash via @ai-sdk/google
                                           ├─ direct AI SDK tool loop, max 10 steps
                                           │    ├─ recipe tools ─> D1
                                           │    └─ week tools ───> D1
                                           ├─ UI-message persistence ─> D1
                                           └─ token/cost estimate ────> D1
```

The Cloudflare deployment currently provides OpenNext assets/cache, D1, KV, a self-service binding, and the OpenNext cache Durable Object. It has neither an `AI` binding nor a Worker Loader binding. The only Durable Object is `DOQueueHandler` for the Next cache, not an agent instance.

### What is already worth preserving

- Authentication and active-team access are checked before the model call.
- Recipe and week reads are scoped by `teamId` inside the tools.
- Chat, message, message-part, and usage records already exist in D1.
- Web responses stream and iOS has an authenticated assistant endpoint.
- Daily request limiting and per-team AI settings provide a starting policy layer.
- Tool schemas already express a small domain API rather than exposing arbitrary SQL.

### Findings

#### P0: Retrieval contracts do not match the data

Evidence:

- `apps/web/src/lib/ai/tools/recipe-tools.ts:73-148` searches recipe names only.
- `tags` are filtered in application code after D1 has already applied `limit`, so matching recipes beyond the first page are invisible.
- The tool accepts lowercase `mealType` values, while the schema documents title-case values and the local data is overwhelmingly the string `"null"`.
- The local corpus has ingredient text for 407 recipes and recipe-body text for 469 recipes, but neither field participates in search.
- There is no relevance score, cursor, deterministic tie-breaker, typo tolerance, ingredient include/exclude behavior, or search explanation.

Impact: prompts such as “quick chicken dinner,” “something with broccoli,” “a soup we have not made recently,” or “vegetarian recipes” either return nothing or an arbitrary subset.

#### P0: Week search is incomplete and can miss valid matches

Evidence:

- `apps/web/src/lib/ai/tools/schedule-tools.ts:18-103` says it searches by status, date range, or name, but exposes no date parameters.
- It fetches at most 20 rows ordered by start date and only then filters by `query` in JavaScript.
- It cannot search for weeks containing a recipe, search grocery items, distinguish an exact date from a status label, or paginate older weeks.

Impact: with 211 weeks, most historical week queries cannot work reliably.

#### P0: Mutations are prompt-gated, not system-gated

The system prompt tells the model to confirm changes, but `add_recipe`, `update_recipe_metadata`, and `update_week` execute immediately when called. There is no approval state in the UI or server tool definition. A prompt instruction is not a safety boundary.

#### P0: Existing chat IDs are not authorized in the main POST path

`getOrCreateChat()` returns any existing chat matching a client-provided ID without verifying its user/team (`apps/web/src/lib/ai/chat-actions.ts:197-238`). The main chat POST then appends to that chat. The read endpoint has a separate ownership check, but its `user mismatch AND team mismatch` condition also allows a match on either dimension. The v2 route must require the existing chat's `userId` and `teamId` to match the authorized request context before any model or persistence work.

#### P1: Configured budgets are mostly display-only

`maxRequestsPerDay` is enforced. `monthlyBudgetUsd` and `maxTokensPerRequest` are loaded and shown in the web UI but are not applied to the model call. Cost rates are a hard-coded table last annotated in 2025, so cost enforcement based on that table would drift.

#### P1: Tool and persistence types are coupled to AI SDK v5

`MyUIMessage`, dynamic `tool-*` part names, and state strings such as `input-available` and `output-available` flow through the API, database mapper, and React UI. This is workable today but makes a runtime migration more than an import change.

#### P1: The iOS assistant is not actually streaming

`FoodTrackerAPIClient.askAssistant()` uses `URLSession.data(for:)`, buffers the complete response, parses only AI SDK `text-delta` events, and returns one final string (`apps/mobile/FoodTracker/Core/AuthStore.swift:97-130`). `AssistantView` stores only user/assistant text and has no tool-progress or approval UI.

#### P1: There is no retrieval evaluation or agent trace

The system stores aggregate token usage but not a stable prompt version, run ID, generated Code Mode program, search parameters, candidate IDs, tool duration, compile/runtime failure, or user feedback. There is no repeatable benchmark proving that a change finds better recipes or weeks.

### Root-cause conclusion

The current assistant is a chat UI attached to six narrow database functions. Its ten-step loop cannot recover information the tools never return. Before adopting a more capable orchestration layer, Food Tracker needs a trustworthy, typed retrieval API and normalized searchable data.

## Part II: RFC

### Goals

- Reliably find recipes by name, ingredients, instructions, tags, meal type, difficulty, recency, and prior-week usage.
- Reliably find weeks by date, status, name, included recipe, and historical relationship.
- Let the model compose bounded read-only searches with loops, branches, parallel calls, and filtering.
- Require explicit user approval for every write.
- Keep every operation scoped to the authenticated active team.
- Preserve web chat history and provide a deliberate iOS migration path.
- Measure retrieval quality, latency, tool behavior, and cost before rollout.

### Non-goals

- Giving generated code arbitrary D1/SQL access.
- Giving the Code Mode sandbox outbound network access.
- Moving all chat state into a Durable Object in the first release.
- Adding MCP servers, browser automation, autonomous background actions, or self-authored persistent skills.
- Replacing deterministic domain search with embeddings before lexical retrieval is proven.

### Stack decision

Use these boundaries:

| Concern | Selected component |
| --- | --- |
| Chat runtime and protocol | `@tanstack/ai`, AG-UI-compatible SSE |
| Web client | `@tanstack/ai-react` |
| Model adapter | `@cloudflare/tanstack-ai` |
| Model routing/telemetry | Cloudflare AI Gateway through the Worker `AI` binding |
| Code execution | `@cloudflare/codemode/tanstack-ai` plus `DynamicWorkerExecutor` |
| Sandbox provision | Cloudflare Worker Loader binding `LOADER` |
| Application data/history | Existing D1 binding and additive schema changes |
| iOS | Native AG-UI SSE decoder; no JavaScript client embedded in Swift |

TanStack AI is currently beta and Cloudflare Code Mode is experimental. Cloudflare now documents a first-class TanStack integration: `createCodeTool()` converts TanStack server tools into one `codemode_execute` tool and executes generated JavaScript in an isolated Worker. Pin exact tested package versions and isolate this integration behind an application-owned interface.

Do not introduce the Cloudflare Agents SDK or an agent Durable Object in phase one. Code Mode does not require it, and the existing application already owns auth, D1 history, and HTTP routing. Reconsider an Agent/DO only if resumable runs, server-initiated turns, durable paused approvals, or WebSocket session state become requirements.

Do not combine Cloudflare Code Mode with TanStack's separate `@tanstack/ai-code-mode` implementation in the same release. The selected path is Cloudflare's TanStack adapter because it directly uses Worker Loader and matches the requested Cloudflare execution model. Keep TanStack's Cloudflare isolate driver as a fallback spike if package compatibility becomes a blocker.

### Target architecture

```text
TanStack React client ────────────┐
                                 ├─> /api/assistant/v2 (Next/OpenNext Worker)
Native Swift AG-UI SSE client ───┘       │
                                         ├─ authorize exact user + active team + chat
                                         ├─ enforce daily, monthly, token, timeout policy
                                         ├─ TanStack AI chat runtime + middleware
                                         │    ├─ Cloudflare AI Gateway model adapter
                                         │    ├─ codemode_execute (read-only)
                                         │    │    └─ isolated dynamic Worker
                                         │    │         ├─ recipes.* typed search tools ─> D1
                                         │    │         └─ weeks.* typed search tools ───> D1
                                         │    └─ direct mutation tools (approval required) ─> D1
                                         ├─ protocol-neutral chat persistence ─> D1
                                         └─ run/tool/retrieval telemetry ───────> D1/logs
```

### Search and data design

#### 1. Normalize the source data

Add an additive, reviewable migration/backfill that:

- Converts sentinel strings such as `"null"` and empty strings to SQL `NULL` where appropriate.
- Canonicalizes `mealType`, `difficulty`, tags, and status values at write/import boundaries.
- Validates week dates and records an explicit parse/data-quality state for legacy rows that cannot be recovered.
- Ensures all future web, mobile-sync, and import writes use the same normalization functions.

This is a prerequisite. Code Mode should not be asked to compensate for invalid facets.

#### 2. Build a deterministic lexical search service

Start with D1 because 520 recipes and 211 weeks do not justify an external retrieval system.

The service should search normalized name, ingredient text, recipe body, and tags; compute a bounded relevance score; apply all filters before `LIMIT`; and return a cursor with deterministic ordering. D1 supports SQLite FTS5, but the implementation should first spike how the repo's Drizzle migration workflow represents and maintains an FTS virtual table. If that is not cleanly supported, ship a conventional denormalized search-document table and explicit relevance SQL first rather than bypassing migration policy.

Required read tools:

```ts
recipes.search({
  text?, ingredientsAny?, ingredientsAll?, excludeIngredients?,
  tagsAny?, mealTypes?, difficulties?, notMadeSince?,
  limit?, cursor?
}) -> { items, nextCursor, appliedFilters }

recipes.getMany({
  ids, include: ["ingredients", "instructions", "history"]
}) -> { items }

recipes.facets() -> {
  mealTypes, difficulties, tags, dataQualityWarnings
}

weeks.search({
  text?, statuses?, containsRecipeIds?, onDate?, from?, to?,
  includeRecipes?, limit?, cursor?
}) -> { items, nextCursor, appliedFilters }

weeks.getMany({ ids, includeRecipes: true }) -> { items }

weeks.findForRecipes({ recipeIds, limit?, cursor? }) -> { matches }
```

Contract rules:

- Every input and output has a Zod schema.
- Every tool receives an authorized request context; tools never re-read cookies.
- No tool accepts `teamId`, `userId`, raw SQL, table names, or arbitrary sort expressions from the model.
- Arrays and text fields have hard size limits. Search limits are clamped and cursors are opaque.
- Results include stable IDs, relevance evidence, and data-quality warnings.
- Search summaries are small; full ingredients/instructions require `getMany`.
- Errors are structured and distinguish invalid input, no matches, authorization failure, and transient failure.

#### 3. Add hybrid semantic retrieval only if the benchmark requires it

If lexical retrieval fails prompts such as “cozy but not heavy,” add Workers AI embeddings plus Vectorize as a separate phase. Store one vector per normalized recipe document, filter by team metadata, and combine lexical and semantic ranks. Do not make Vectorize a prerequisite for the initial Code Mode release.

### Code Mode design

Expose only read-only tools to the stateless Code Mode tool:

```ts
const executor = new DynamicWorkerExecutor({
  loader: env.LOADER,
  globalOutbound: null,
});

const codeModeTool = createCodeTool({
  tools: [
    tanstackTools(recipeReadTools, "recipes"),
    tanstackTools(weekReadTools, "weeks"),
  ],
  executor,
});
```

The sandbox can then execute a plan such as:

```ts
const candidates = await recipes.search({
  ingredientsAny: ["chicken", "broccoli"],
  mealTypes: ["dinner"],
  limit: 25,
});

const details = await recipes.getMany({
  ids: candidates.items.slice(0, 8).map((recipe) => recipe.id),
  include: ["ingredients", "history"],
});

const priorWeeks = await weeks.findForRecipes({
  recipeIds: details.items.map((recipe) => recipe.id),
  limit: 20,
});

return rankByFitAndRecency(details.items, priorWeeks.matches).slice(0, 3);
```

Operational limits:

- 10-second initial execution timeout; tune from measured p95.
- Maximum 12 external tool calls and maximum 50 records per call.
- Maximum two cursor pages per search in the first release.
- No `fetch`, filesystem, secrets, environment, or arbitrary bindings in the dynamic Worker.
- Log generated code and tool metadata with sensitive fields redacted.
- One retry for a compilation error only; no unbounded self-correction loop.

Code Mode should be preferred for composed discovery and comparison. A simple “open recipe X” request can still use a direct read tool if evaluation shows lower latency.

### Mutation and approval design

Define mutations as normal TanStack server tools with `needsApproval: true`:

- `recipes.create`
- `recipes.update`
- `weeks.update`
- `weeks.addRecipes`
- `weeks.removeRecipes`
- future grocery-list writes

Do not place them inside `tanstackTools()` for the stateless Code Mode integration. Cloudflare documents that `createCodeTool()` excludes TanStack tools whose `needsApproval` is `true` or a function; it does not pause a sandbox execution for approval. The normal TanStack tool path supports approval events and client responses.

The model may use Code Mode to prepare a proposed mutation payload, but the server must emit an approval request containing the exact IDs and changes. Approval is single-use, bound to the authenticated user/team/run, expires, and is revalidated immediately before the write.

### TanStack AI runtime

Create an application-owned `startAssistantRun()` boundary that:

1. Parses and validates the AG-UI request.
2. Authorizes the user, active team, and existing chat with exact conjunctions.
3. Creates `{ db, userId, teamId, chatId, requestId }` runtime context.
4. Creates the Cloudflare AI Gateway adapter from `env.AI`.
5. Registers the read-only Code Mode tool and direct approval-required mutations.
6. Adds middleware for limits, tracing, usage, persistence, redaction, and tool audit.
7. Streams a TanStack AG-UI-compatible SSE response.

Initially keep Gemini 2.5 Flash to avoid changing the runtime, retrieval layer, and model simultaneously. Route it through AI Gateway, capture a baseline, then compare qualified models on the Food Tracker benchmark. Model choice is a measured configuration, not a hard-coded architecture decision.

### Cloudflare configuration

Add and type-generate:

```jsonc
{
  "ai": { "binding": "AI" },
  "worker_loaders": [{ "binding": "LOADER" }]
}
```

Also:

- Advance `compatibility_date` only with preview/build verification.
- Keep `nodejs_compat`.
- Run `pnpm cf-typegen` after binding changes.
- Configure an AI Gateway ID as non-secret configuration.
- Use Cloudflare Unified Billing or a provider secret deliberately; do not leave implicit provider-key behavior.
- Keep Code Mode outbound access disabled.
- Add structured logs with request/run/chat IDs and sampling; do not log full recipe bodies, credentials, cookies, or unredacted user prompts by default.

No new Durable Object migration is required for the stateless design.

### Persistence migration

Preserve `ai_chats` and existing history. Add protocol-neutral storage rather than extending AI SDK-specific state names indefinitely:

- Add generic `partType` and `payloadJson` fields to message parts, or introduce an additive v2 parts table.
- Add `ai_runs` with run status, model, prompt version, start/end time, usage, finish reason, and error classification.
- Add `ai_tool_executions` with tool/namespace, sanitized input/output summaries, duration, status, Code Mode execution ID, and approval state.
- Persist final text/tool parts, not every token delta.
- Provide a legacy reader that maps existing AI SDK v5 parts into the new application message type.
- Stop importing the API route's message type into persistence modules.

Update `updatedAt` on chats after every successful turn so history ordering is meaningful.

### Web and iOS clients

Web:

- Replace `@ai-sdk/react` with `@tanstack/ai-react` behind the v2 flag.
- Render text, tool progress, Code Mode custom events, failures, and mutation approval cards.
- Keep chat history APIs application-owned and map stored messages to the TanStack client type.
- Preserve the legacy route until persisted-history and cancel/retry behavior are proven.

iOS:

- Keep the native Swift UI.
- Replace `URLSession.data(for:)` with incremental `URLSession.bytes(for:)` SSE parsing.
- Decode AG-UI run, text, tool, custom Code Mode, approval, finish, and error events.
- Render progressive text and a concise “Searching recipes / Comparing weeks” state.
- Make the first mobile v2 release read-only if approval UI is not yet complete.
- Do not claim mobile parity until the accepted web behavior is visible in the simulator.

### Security requirements

- Exact chat ownership: `chat.userId === userId && chat.teamId === teamId`.
- Explicit request context passed into every tool factory.
- Team scope applied inside every D1 query, including joins and full-text/vector search.
- No arbitrary SQL, raw D1 binding, service binding, secrets, or network access in the sandbox.
- Mutations excluded from stateless Code Mode and guarded by server-enforced approval.
- Recipe bodies and tool outputs treated as untrusted data, never as system instructions.
- Monthly budget, daily request count, model-token limit, tool-call limit, response-size limit, and execution timeout enforced server-side.
- Rate limits charged on accepted runs, including failures that consume model inference.
- Error responses distinguish 401, 403, 409, 422, 429, and 500 rather than mapping most failures to 403.

### Observability and evaluation

Create a versioned evaluation set from real, team-scoped data. Minimum categories:

- Exact recipe lookup and typo/case variants.
- Ingredient include/exclude prompts.
- Vague intent prompts such as quick, comforting, light, or kid-friendly.
- Current/upcoming/historical week lookup by date and name.
- “Which weeks contained recipe X?” relationship queries.
- Multi-stage prompts that compare candidates by last-made history.
- No-result behavior.
- Cross-team isolation and malicious tool/prompt inputs.
- Mutation proposals, denials, approvals, expiration, and replay attempts.

Track:

- Recall@1/3/5 against accepted recipe/week IDs.
- Correct-week rate and fabricated-ID rate.
- Tool plan success, generated-code compile/runtime errors, and retries.
- D1 query count/duration and result counts.
- First-token, total, and Code Mode execution latency.
- Input/output tokens, Cloudflare gateway cost, and budget denials.
- Approval requested/accepted/denied and mutation success.
- User feedback: helpful/not helpful plus optional selected result.

Release gate: at least 90% exact/date lookup accuracy, material improvement over v1 on ambiguous retrieval, zero cross-team reads in automated tests, zero unapproved writes, and acceptable p95 latency agreed from the baseline.

### Delivery plan

#### Phase 0: Baseline and safety (M)

- Build the evaluation fixture and record v1 results.
- Fix exact chat authorization.
- Enforce monthly/token settings and classify errors.
- Add run/request IDs and structured logging.

#### Phase 1: Data and retrieval (L)

- Add canonicalization at every write/import/sync boundary.
- Generate and apply the additive D1 migration/backfill through the repo migration workflow.
- Implement and unit-test recipe/week search services.
- Add retrieval contract tests against a seeded corpus.

#### Phase 2: TanStack AI v2 without Code Mode (M)

- Add pinned TanStack/Cloudflare packages and the `AI` binding.
- Implement `/api/assistant/v2`, AG-UI SSE, middleware, and protocol-neutral persistence.
- Keep the existing model and direct read tools to establish parity.
- Add web feature flag and legacy fallback.

#### Phase 3: Read-only Cloudflare Code Mode (M)

- Add `LOADER`, generate types, and wire `DynamicWorkerExecutor`.
- Expose recipe/week read namespaces only.
- Enforce execution quotas and capture redacted traces.
- Run the benchmark and tune tool descriptions/output sizes.

#### Phase 4: Approval-required mutations (M)

- Define direct TanStack mutation tools with `needsApproval`.
- Build web approval UI, expiry/revalidation, and audit records.
- Add recipe-to-week operations, which the current agent lacks.

#### Phase 5: iOS AG-UI parity (M)

- Implement incremental SSE and event mapping.
- Ship visible search/progress states.
- Add approvals only after the web behavior is accepted.
- Verify end to end in the simulator.

#### Phase 6: Rollout and cleanup (S-M)

- Enable v2 for the default team, then increase exposure by feature flag.
- Monitor retrieval quality, failures, latency, and spend.
- Keep instant rollback to v1 during the observation window.
- Remove AI SDK v5 packages and legacy mappers only after history and both clients are migrated.

Expected effort is roughly 15-25 focused engineering days, with data/search quality and client migration accounting for more work than Code Mode wiring itself.

### Acceptance criteria

- The agent can find recipes using ingredients and recipe-body concepts, not only names.
- The agent can find any authorized week by date/name/status and can identify weeks containing a recipe.
- Compound prompts use a bounded Code Mode program and return stable, inspectable results.
- No generated code has direct network, SQL, binding, environment, or secret access.
- Every write requires a visible, exact approval and is audited.
- Monthly, daily, token, tool-call, timeout, and response-size policies are enforced.
- Web streams AG-UI events and preserves existing history.
- iOS incrementally streams the accepted behavior and visibly shows tool progress.
- The versioned benchmark demonstrates the release gate before v1 is retired.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| TanStack AI beta or Code Mode experimental API churn | Pin exact versions; wrap in `startAssistantRun()` and domain-owned tool definitions; keep v1 rollback. |
| Code Mode adds latency or compilation failures | Use it only for composed retrieval, bound execution, log compile failures, benchmark model compatibility. |
| Weak data still dominates results | Complete canonicalization and lexical-search acceptance tests before enabling Code Mode. |
| Approval does not pause inside stateless Code Mode | Exclude mutations from Code Mode; use normal TanStack approval tools. |
| OpenNext/Worker Loader integration surprises | Prove a minimal preview deployment before migrating persistence/UI. |
| AG-UI breaks existing history/mobile parsing | Add v2 endpoint and protocol adapters; migrate web first, then native Swift. |
| Search leaks data across teams | Request-scoped context, team predicates in every query/join, adversarial isolation tests. |
| Vector search increases operational complexity | Defer until lexical benchmark shows a measurable gap. |

### Open decisions

1. Should chats be private to a user, shared with the active team, or explicitly shareable? The schema carries both user and team ownership, but current endpoints apply inconsistent semantics.
2. Should legacy recipes with unrecoverable `mealType`/`difficulty` remain unset or be classified by a one-time model-assisted job after deterministic normalization?
3. Should the initial AI Gateway path use Cloudflare Unified Billing or an existing provider key through a provider-native endpoint?
4. What p95 latency and per-run spend are acceptable for compound Code Mode searches?
5. Is semantic search necessary after ingredient/body lexical search and Code Mode composition are measured?

## Primary references

- [TanStack AI overview](https://tanstack.com/ai/latest/docs/getting-started/overview)
- [TanStack AI tools](https://tanstack.com/ai/latest/docs/tools/tools)
- [TanStack AI tool approvals](https://tanstack.com/ai/latest/docs/tools/tool-approval)
- [TanStack AI middleware](https://tanstack.com/ai/latest/docs/advanced/middleware)
- [Cloudflare adapter for TanStack AI](https://tanstack.com/ai/latest/docs/community-adapters/cloudflare)
- [Cloudflare Code Mode overview](https://developers.cloudflare.com/agents/tools/codemode/)
- [Cloudflare Code Mode with TanStack AI](https://developers.cloudflare.com/agents/tools/codemode/tanstack-ai/)
- [Cloudflare Code Mode announcement and isolation model](https://blog.cloudflare.com/code-mode/)
- [Cloudflare AI Gateway Worker binding](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/)
- [Cloudflare D1 SQL and FTS5 support](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
