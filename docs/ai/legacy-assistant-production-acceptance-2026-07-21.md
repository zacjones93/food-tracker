# Legacy assistant production acceptance — 2026-07-21

This is a sanitized record of an explicitly approved, read-only production-backed verification of
the retired Gemini 2.5 Flash assistant. It is baseline evidence for the TanStack AI and Cloudflare
Code Mode replacement; it is not a repeatable fixture and contains no credentials, session values,
tenant identifiers, chat identifiers, prompts, recipe bodies, or source URLs.

## Observed behavior

- The legacy route depended on `GOOGLE_GENERATIVE_AI_API_KEY`. The isolated worktree did not load
  that existing local secret until the approved verifier supplied the main checkout's environment.
  The replacement does not use this key; inference is provided through the native Workers AI
  binding.
- A search for three chicken dinner recipes called the legacy recipe search with lowercase
  `mealType: "dinner"`. Production rows use title-case values such as `"Dinner"`, so the SQL
  equality predicate incorrectly returned no matches. The replacement canonicalizes both stored
  and requested meal types and has direct regression coverage.
- Schedule retrieval returned two rows marked `current`, with date ranges July 21–30 and July
  14–20. Both contained 12 recipes. The replacement treats date containment as the authoritative
  meaning of “this week” and emits `multiple_current_weeks` when imported status data is ambiguous.
- A cross-source follow-up reused schedule-provided recipe IDs to fetch two recipes and accurately
  represented their ingredients, details, and missing fields. The replacement preserves this
  ID-based recipe/week retrieval flow with request-scoped tenant authorization.
- Legacy development logs exposed prompts, user/team/chat IDs, SQL parameters, tool payloads,
  recipe bodies, and a source URL query containing `mcp_token`. The replacement logs correlated
  metadata without prompts or payloads and removes URL credentials, query strings, and fragments
  before source links enter model-visible tool output or persisted assistant parts.

## Legacy runtime baseline

| Call | Total time | Total tokens | Estimated cost |
| --- | ---: | ---: | ---: |
| Recipe search | 9.967 s | 1,869 | $0.00061130 |
| Schedule retrieval | 12.364 s | 6,891 | $0.00305815 |
| Two-recipe lookup | 9.990 s | 11,570 | $0.00407805 |
| **Total** | — | **20,330** | **$0.00774750** |

The browser rendered content without a Next.js error overlay or captured console errors. The
temporary production session was signed out, local processes were stopped, and temporary binding
flags were restored by the verifier. The retained production verification chat was not accessed or
modified during this integration work.
