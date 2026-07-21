# Retrieval core

The public search/detail contracts are intentionally independent from their corpus provider. The
current D1 provider reads the small authorized team corpus, and the core applies every normalized
filter before its deterministic cursor and output limit. This preserves correctness for legacy JSON
and sentinel values without adding a migration in this slice.

A later FTS5 or denormalized search-document provider can replace the corpus load while preserving
the same strict inputs, summaries, relevance evidence, cursors, structured results, and detail APIs.
That provider must keep team predicates on every table/join and implement the same filter-before-limit
semantics. FTS5 is therefore an optimization backend, not a contract change.
