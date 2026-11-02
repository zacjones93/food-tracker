# Web list performance evidence

Measured 2026-11-02 on local D1 (Miniflare/workerd), not production. Seed: 514 recipes, 202 weeks, 1,539 week_recipes, 38 recipe books. Production context has 708 recipes and 266 weeks. The legacy seed has no meal types, tags or book links; the benchmark’s explicit `--enrich-fixture` flag populates those fields on two thirds of local recipes so filter and metadata measurements exercise nonempty results. No remote writes or remote migrations were run.

## Changes

- Recipe matching selects only ID/name/createdAt, applies search/meal/difficulty/book/tag/season constraints in SQL, preserves the existing JavaScript locale-aware ordering, and slices the matching IDs. Metadata and grouped team schedule stats are then fetched for only those page IDs in parallel. There are three statements in two dependent stages, independent of result size. Count-based filters and most-eaten ordering require a single grouped stats query for all matching candidates before slicing; those reuse its result afterward.
- The web page now returns 20 recipes. Shallow URL filter changes call the list action without refreshing the whole route or fetching metadata/books again. Search waits 200 ms after typing stops; outdated responses are ignored. Search supports name OR tags for each term, with AND across terms. Book options load once per mounted filter panel. Filter fields no longer become new component types on each render.
- List contracts exclude bodies, ingredients, links, internal integration fields and other unused fields. Full detail/edit actions retain full recipes.
- Metadata uses a materialized visible-recipes CTE plus UNION/json_each to deduplicate in SQLite. Books and metadata reads run in parallel. No cross-request cache or invalidation scheme was added.
- Books aggregate counts once per team, then join the small count relation. Book visibility, count ordering, pagination and tie order are preserved (checked against the old relational query on the enriched fixture).
- Generated migration adds week_recipes(recipeId,weekId) and weeks(teamId,startDate). The first removes a bad week-first nested-loop plan (109,160 rows read before index to 4,619 for the all-candidate stats experiment); the second removes the schedule weeks-order temporary b-tree.

## Rows read and payloads

Payloads below are UTF-8 JSON bytes of recipe props/results, not complete Next.js RSC wire responses. Runtime headers, other page components and Flight encoding are excluded. Large ingredients/body JSON is no longer decoded or serialized for lists.

| Path | Rows read before → after | Recipe payload bytes before → after |
|---|---:|---:|
| Initial recipes | 16,418 → 1,712 | 978,490 → 6,401 |
| Search chicken | 6,011 → 1,324 | 366,685 → 6,457 |
| Book filter | 10,729 → 850 | 660,939 → 6,489 |
| Multi-term chicken rice | 1,346 → 1,132 (10 matches) | 48,939 → 3,283 (all 10 narrow results) |
| Filter options | 1,028 → 3,278 | 33,566 → 338 (raw D1 JSON) |
| Recipe books | 19,570 → 1,106 | 19,672 → 5,572 (raw D1 JSON) |
| Schedule/weeks (same query, index only) | 5,222 → 5,020 | unchanged |

Metadata reads more SQLite virtual/materialized rows to return distinct values; its result size and Worker JSON work shrink substantially. No additional index would avoid enumerating JSON tags. Raw recipe-book byte reduction measures the database response; the old action already removed its recipe arrays before returning to the client.

## Local timings

15 warm iterations using performance.now(); includes local D1 RPC, decoding and JSON serialization. These are not Worker CPU measurements, browser paint times or authenticated page latency. Fixed Miniflare RPC overhead can outweigh SQLite execution and makes extra statements costly even where production payload/CPU work falls.

| Work | Median before → after (ms) | p90 before → after (ms) |
|---|---:|---:|
| Initial list | 48.66 → 38.12 | 54.63 → 40.58 |
| One book-filter toggle | 29.28 → 32.78 | 32.20 → 33.44 |
| Search action for chicken | 22.94 → 35.46 | 23.90 → 37.74 |
| Initial tag/options load (metadata read only) | 11.15 → 10.66 | 11.97 → 11.98 |

A single search keystroke formerly performed a local name filter on the entire already-downloaded catalogue and made no server request. That was a different operation and has no comparable old server latency. The new keystroke updates the input immediately, then adds a deliberate 200 ms debounce before the measured search action, plus network/auth/rendering time. Local backend search is slower because it now has two dependent stages; the intended gain is a much smaller initial download and Worker serialization work. End-to-end interaction timings and the <1 second production target remain unverified.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm db:seed:local
pnpm --filter @food-tracker/web exec tsx scripts/measure-web-lists.cts --enrich-fixture
pnpm typecheck
pnpm lint
pnpm test
```

The measurement script uses getPlatformProxy with local D1 and writes /tmp/web-list-measurements.json. It executes the original and new query shapes on the same fixture and asserts matching schedule counts/latest-week IDs and book counts/order. The committed JSON contains exact SQL, bind values (local fixture IDs), EXPLAIN QUERY PLAN, rows_read, duration, bytes and timings. The before-index file records the original schedule plan and the rejected stats plan.

## Query plans

### Old recipe list

```text
MULTI-INDEX OR
INDEX 1
SEARCH recipes USING INDEX recipes_team_client_id_idx (teamId=?)
INDEX 2
SEARCH recipes USING INDEX recipes_visibility_idx (visibility=?)
SEARCH week_recipes USING COVERING INDEX wr_recipe_week_idx (recipeId=?) LEFT-JOIN
SEARCH weeks USING INDEX sqlite_autoindex_weeks_1 (id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
CORRELATED SCALAR SUBQUERY 1
SEARCH week_recipes USING COVERING INDEX wr_recipe_week_idx (recipeId=?)
SEARCH weeks USING INDEX sqlite_autoindex_weeks_1 (id=?)
USE TEMP B-TREE FOR ORDER BY
CORRELATED SCALAR SUBQUERY 2
SEARCH week_recipes USING COVERING INDEX wr_recipe_week_idx (recipeId=?)
SEARCH weeks USING INDEX sqlite_autoindex_weeks_1 (id=?)
USE TEMP B-TREE FOR ORDER BY
USE TEMP B-TREE FOR count(DISTINCT)
```

### Matching candidates

```text
MULTI-INDEX OR
INDEX 1
SEARCH recipes USING INDEX recipes_team_client_id_idx (teamId=?)
INDEX 2
SEARCH recipes USING INDEX recipes_visibility_idx (visibility=?)
USE TEMP B-TREE FOR ORDER BY
```

### Page metadata

```text
SEARCH recipes USING INDEX sqlite_autoindex_recipes_1 (id=?)
LIST SUBQUERY 1
SCAN json_each VIRTUAL TABLE INDEX 1:
CREATE BLOOM FILTER
```

### Page stats

```text
SEARCH week_recipes USING COVERING INDEX wr_recipe_week_idx (recipeId=?)
LIST SUBQUERY 1
SCAN json_each VIRTUAL TABLE INDEX 1:
CREATE BLOOM FILTER
SEARCH weeks USING INDEX sqlite_autoindex_weeks_1 (id=?)
USE TEMP B-TREE FOR count(DISTINCT)
```

### Old filter options

```text
MULTI-INDEX OR
INDEX 1
SEARCH recipes USING INDEX recipes_team_client_id_idx (teamId=?)
INDEX 2
SEARCH recipes USING INDEX recipes_visibility_idx (visibility=?)
```

### New filter options

```text
COMPOUND QUERY
LEFT-MOST SUBQUERY
MATERIALIZE visible
MULTI-INDEX OR
INDEX 1
SEARCH recipes USING INDEX recipes_team_client_id_idx (teamId=?)
INDEX 2
SEARCH recipes USING INDEX recipes_visibility_idx (visibility=?)
SCAN visible
UNION USING TEMP B-TREE
SCAN visible
UNION USING TEMP B-TREE
SCAN visible
SCAN json_each VIRTUAL TABLE INDEX 1:
```

### Old books

```text
MULTI-INDEX OR
INDEX 1
SEARCH recipeBooksTable USING INDEX recipe_books_team_name_idx (teamId=?)
INDEX 2
SEARCH recipeBooksTable USING INDEX recipe_books_team_name_idx (teamId=?)
CORRELATED SCALAR SUBQUERY 1
SEARCH recipeBooksTable_recipes USING INDEX recipes_team_client_id_idx (teamId=?)
```

### New books

```text
MATERIALIZE recipeCounts
SEARCH recipes USING INDEX recipes_team_client_id_idx (teamId=?)
USE TEMP B-TREE FOR GROUP BY
MULTI-INDEX OR
INDEX 1
SEARCH recipe_books USING INDEX recipe_books_team_name_idx (teamId=?)
INDEX 2
SEARCH recipe_books USING INDEX recipe_books_team_name_idx (teamId=?)
SEARCH recipeCounts USING AUTOMATIC COVERING INDEX (recipeBookId=?) LEFT-JOIN
```

### Weeks using the new index

```text
SEARCH weeksTable USING INDEX weeks_team_start_idx (teamId=?)
CORRELATED SCALAR SUBQUERY 4
CO-ROUTINE weeksTable_recipes
SEARCH weeksTable_recipes USING INDEX wr_week_idx (weekId=?)
USE TEMP B-TREE FOR ORDER BY
SCAN weeksTable_recipes
CORRELATED SCALAR SUBQUERY 2
CO-ROUTINE weeksTable_recipes_recipe
SEARCH weeksTable_recipes_recipe USING INDEX sqlite_autoindex_recipes_1 (id=?)
SCAN weeksTable_recipes_recipe
```

## Validation and limits

- pnpm typecheck: PASS, 1/1 task.
- pnpm lint: PASS, 1/1 task; existing warnings in unrelated files remain.
- pnpm test: PASS, 4/4 tasks; web 114 tests, assistant worker 42, notifications 10 (166 total).
- Focused isolated local D1 regression proves distinct team-week counting, latest-week pairing, NULL dates, absent/empty recipes and a >100-ID request with one statement. Removing the team predicate deliberately caused the test to fail with the foreign week/count, then restoring it passed.
- GitNexus detect_changes: combined diff HIGH risk (19 indexed symbols / 10 affected flows); individual list/books actions LOW. Indexed callers undercount metadata consumers: manual references include schedule pickers and recipe create/edit dialogs.
- The flat schedule experiment was rejected: it read 5,222 rows across two statements, transferred 244,103 raw bytes versus 203,822 for the relational query, and did not improve local latency. Only its index improvement ships.
- Dashboard redirects to /schedule and benefits from that index; there is no separate dashboard query to optimize.
- Shared auth/team/entitlement helpers, mobile APIs and mobile-workspace were left untouched as assigned. No deployment, push, PR, remote migration or remote mutation occurred.
- Candidate name/date rows remain unbounded to preserve existing localeCompare ordering exactly; the full content and tag arrays are bounded to the page. Most-eaten/count filters need all candidate stats. A future server-collation/order contract could permit SQL-only pagination without changing current ordering.

## Changed files

- `apps/web/src/app/(dashboard)/recipe-books/recipe-books.actions.ts`
- `apps/web/src/app/(dashboard)/recipes/_components/recipe-card.tsx`
- `apps/web/src/app/(dashboard)/recipes/_components/recipe-filters.tsx`
- `apps/web/src/app/(dashboard)/recipes/_components/recipes-content.tsx`
- `apps/web/src/app/(dashboard)/recipes/_components/recipes-table.tsx`
- `apps/web/src/app/(dashboard)/recipes/page.tsx`
- `apps/web/src/app/(dashboard)/recipes/recipes.actions.ts`
- `apps/web/src/db/migrations/meta/_journal.json`
- `apps/web/src/db/schema.ts`
- `apps/web/scripts/measure-web-lists.cts`
- `apps/web/src/db/migrations/0042_web_list_query_indexes.sql`
- `apps/web/src/db/migrations/meta/0042_snapshot.json`
- `apps/web/src/lib/recipe-list-queries.test.ts`
- `apps/web/src/lib/recipe-list-queries.ts`
- `docs/performance/web-list-before-indexes.json`
- `docs/performance/web-list-measurements.json`
- `docs/performance/web-list-queries.md`
