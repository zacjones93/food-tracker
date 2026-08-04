# Next.js to TanStack Start migration guide

- Status: Proposed
- Last reviewed: 2026-07-21
- Scope: `apps/web` only, including every web page, server action, public API, mobile API, Worker binding, and web-owned integration
- Delivery model: Test-driven, compatibility-first, reversible cutover

## Executive decision

Migrate the web application to TanStack Start in a sibling app, `apps/web-start`, while the existing `apps/web` Next.js application remains deployable. Build a framework-neutral application layer that both apps can exercise during the transition, prove behavioral parity with automated tests, then replace the production Worker only after every feature and contract in this guide is green.

Do not migrate the current React Server Components to TanStack Start Server Components. TanStack Start's Server Components are still experimental. Convert server-rendered page data to authenticated `createServerFn` functions called by route loaders, and convert client mutations to `createServerFn({ method: "POST" })`. Preserve raw HTTP endpoints as TanStack Start server routes.

The migration is complete only when:

1. Every feature row in the coverage matrix has automated acceptance coverage.
2. Every existing URL and external HTTP contract is either preserved or has an explicitly approved redirect/version change.
3. Security-critical code has 100% statement, branch, function, and line coverage.
4. The full suite passes against a production-mode TanStack Start build running in the Cloudflare Workers runtime.
5. The old Next.js Worker can be restored without a database rollback.

## Why this shape

TanStack Start uses file-based TanStack Router routes, route loaders, server functions, server routes, middleware, and a standard Worker `fetch` entry point. Server functions are intended for calls from the Start application, while server routes are intended for external HTTP consumers. That boundary maps cleanly to this app:

- The 79 server-action exports (78 ZSA actions plus the standalone sign-out action) become authenticated and validated server functions.
- The 26 API route files become server routes because they are URL-level contracts, several of which are consumed by the iOS app, Stripe, or the assistant UI.
- Async Next.js pages become TanStack route components with loaders.
- Next.js route-group layouts become pathless TanStack layout routes.
- OpenNext deployment and cache infrastructure is removed only after application-owned D1 and KV bindings are separated from their historical `NEXT_*` names.

Primary references:

- [TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Start routing](https://tanstack.com/start/latest/docs/framework/react/guide/routing)
- [TanStack Start server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)
- [TanStack Start middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)
- [TanStack Start execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)
- [TanStack Start on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Testing TanStack file-based routes](https://tanstack.com/router/latest/docs/how-to/test-file-based-routing)

## Current application baseline

This inventory reflects the working tree on 2026-07-21, including work that is not yet committed.

| Surface | Current count | Migration implication |
| --- | ---: | --- |
| Page routes | 30 | Each needs route discovery, render, loading, error, authorization, and navigation coverage as applicable. |
| Layouts | 6 | Recreate root, auth, dashboard, marketing, legal, and settings nesting with pathless routes. |
| API route files | 26 | Preserve method, path, status, headers, body, streaming, auth, and error contracts. |
| Server-action exports | 79 | Move behavior behind application services, then expose it through Start server functions. This is 78 ZSA actions plus the standalone sign-out action. |
| Existing web test files | 13 | Keep all behavior; migrate the runner without weakening assertions. |
| Existing test cases | 53 | These are the starting characterization suite, not adequate feature parity coverage. |
| Files using Next-specific APIs | 96 | Replace imports deliberately; do not use a bulk textual rewrite. |
| D1 tables | 25 | No schema migration is required solely for the framework migration. |

### Current runtime dependencies that must survive

- D1 through `NEXT_TAG_CACHE_D1`, currently used both as the application database and as an OpenNext-named binding.
- KV through `NEXT_INC_CACHE_KV`, currently used for sessions, rate limiting, and application caching as well as carrying an OpenNext name.
- Service bindings `ASSISTANT` and `WORKER_SELF_REFERENCE`.
- OpenNext cache-only Durable Object `NEXT_CACHE_DO_QUEUE` and its migration. This should disappear after OpenNext is retired, provided no application behavior depends on it.
- Worker variables and secrets including `APP_URL`, email configuration, Stripe configuration, AI configuration, and Turnstile configuration.
- Cloudflare request metadata used for session geography and IP/rate limiting.
- Drizzle D1 schema and generated migrations.

## Non-goals

- Redesigning the UI or changing product behavior during framework parity work.
- Changing the database schema because of the framework migration.
- Renaming external API paths or changing mobile payloads.
- Replacing the authentication model, Stripe, Drizzle, D1, KV, the assistant Worker, or the notification Worker.
- Adopting experimental TanStack Start Server Components.
- Combining the web and assistant Workers.
- Improving unrelated domain code unless a characterization test proves the refactor preserves behavior.

## Test-driven migration contract

Every migration slice follows the same loop:

1. **Characterize:** Add a failing or missing test against the existing Next.js behavior. Record the observable contract, not implementation details.
2. **Red:** Run the same test against the Start target and see it fail for the expected reason.
3. **Green:** Implement the minimum Start route, server function, adapter, or component needed to pass.
4. **Refactor:** Remove framework coupling from the shared application service while both old and new tests remain green.
5. **Parity:** Run the contract against both implementations and compare normalized results.
6. **Production proof:** Run the test against a built Worker with real local D1/KV bindings, not only Vite's browser dev server.

No feature moves to “migrated” because a page renders. Its authorization failures, validation failures, empty/loading/error states, mutations, cache invalidation, keyboard behavior, and external effects must also pass.

### Definition of full coverage

“Full coverage” means full product-behavior coverage, with code coverage used as a backstop:

- 100% of the feature rows and route/API contract rows in this document have at least one automated happy-path test and all material negative-path tests.
- 100% statements, branches, functions, and lines for session parsing/rotation/revocation, team authorization, billing webhook state reconstruction, entitlements, mobile sync conflict handling, assistant access control, and rate limiting.
- Repository-wide minimum after generated files, schema declarations, email markup, and static UI constants are excluded: 90% statements, 90% lines, 90% functions, and 85% branches.
- No decrease from the established baseline without an explicit reviewed exception.
- Generated `routeTree.gen.ts` is excluded from coverage but its expected route inventory is tested.
- Type coverage is enforced by `tsc --noEmit`; coverage percentages do not substitute for type checking.

## Test architecture

Use separate test projects so browser code, pure domain code, and Worker code run in the environment they actually require.

| Project | Runtime | Purpose |
| --- | --- | --- |
| `unit` | Vitest Node | Pure schemas, normalization, entitlement rules, assistant protocol transforms, and other environment-free logic. |
| `component` | Vitest + jsdom + Testing Library | Forms, dialogs, tables, filters, loading/error/empty states, keyboard behavior, and route component rendering. |
| `router` | Vitest + memory history | Generated route discovery, params/search validation, guards, redirects, not-found behavior, and navigation. |
| `worker` | `@cloudflare/vitest-pool-workers` | D1, KV, request metadata adapters, sessions, server functions, server routes, service binding fakes, and raw `Response` behavior. |
| `contract` | Vitest/Worker | Run the same HTTP and application-service contract vectors against Next and Start. Normalize nondeterministic IDs, dates, and request IDs before diffing. |
| `e2e` | Playwright | Browser journeys against a production build, including Chromium and WebKit/mobile viewport coverage. |

Cloudflare recommends its Vitest integration for Worker projects because it runs tests inside the Workers runtime, exposes bindings, provides isolated storage, and supports local Miniflare-backed integration tests. Use `readD1Migrations` and `applyD1Migrations` to build a fresh D1 database for each test file. Override `ASSISTANT` and other service bindings with deterministic fakes.

### Proposed scripts

Names are a target contract; pin actual package versions together after validating compatibility.

```json
{
  "scripts": {
    "test": "pnpm test:unit && pnpm test:component && pnpm test:router && pnpm test:worker && pnpm test:contract",
    "test:unit": "vitest run --project unit",
    "test:component": "vitest run --project component",
    "test:router": "vitest run --project router",
    "test:worker": "vitest run --project worker",
    "test:contract": "vitest run --project contract",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:migration": "pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e"
  }
}
```

### Test fixtures

Create deterministic builders, never one shared mutable seed:

- Users: anonymous, valid member, expired session, removed member, owner, admin, user with multiple teams.
- Teams: free, active Pro, trialing, canceled but paid-through, AI disabled, AI budget exhausted.
- Recipes: private, team-visible, public, remix/source-linked, sectioned ingredients, related recipes.
- Weeks: current, upcoming, archived, arbitrary-length date range, free-plan limit reached.
- Groceries: categorized, checked, reordered, transferred, template-generated.
- AI: owned and foreign chats, partial stream, completed run, canceled run, resumable run, invalid mention, budget/rate limit errors.
- Mobile sync: initial bootstrap, offline create followed by update, duplicate mutation, stale cursor, conflict, cross-team attempt.
- Billing: signed and invalid webhooks, duplicate event, out-of-order events, unrelated price, active/trialing/canceled states.

Use fake clocks and injected ID generators. Never make tests depend on current wall-clock time, live Stripe, live AI providers, production D1/KV, or external email delivery.

## Target application structure

```text
apps/
  web/                         # Existing Next.js app until cutover
  web-start/                   # TanStack Start target
    src/
      routes/
        __root.tsx
        _auth.tsx
        _auth/
        _dashboard.tsx
        _dashboard/
        _settings.tsx
        _settings/
        api/
      router.tsx
      start.ts
      server.ts
      styles.css
    vite.config.ts
    vitest.config.ts
    wrangler.jsonc
packages/
  web-core/                    # Framework-neutral application services and contracts
  web-testkit/                 # Fixtures and parity test helpers
```

Do not immediately move every file into `packages/web-core`. Extract one vertical slice only after its Next characterization tests exist. Shared code must not import from `next/*`, `@opennextjs/cloudflare`, `@tanstack/*`, React routing APIs, or framework request globals.

### Runtime ports

Framework-neutral services receive named dependencies:

```typescript
interface RecipeServiceDependencies {
  db: AppDatabase;
  clock: Clock;
  createId: () => string;
}

interface RequestServices {
  db: AppDatabase;
  sessions: SessionStore;
  rateLimits: RateLimitStore;
  assistant: AssistantService;
}
```

Keep function parameters as named objects, matching the repository convention. Start middleware constructs request-scoped services from Cloudflare bindings and passes them through context. Tests pass in deterministic implementations.

Do not cache a D1-backed Drizzle instance in a cross-request module global. Construct it from the request's Worker binding or inject it through typed request context. TanStack Start's execution model makes route loaders isomorphic, so a loader must call a server function before touching D1, KV, secrets, request headers, or session data.

## Framework translation table

| Next.js/OpenNext | TanStack Start target | Required parity test |
| --- | --- | --- |
| `app/**/page.tsx` | `src/routes/**.tsx` with `createFileRoute` | Route exists, params/search parse, SSR content, navigation. |
| Route groups such as `(dashboard)` | Pathless layout routes such as `_dashboard` | Parent guard and shell wrap every child exactly once. |
| Async Server Component data | Route loader calling `createServerFn` | SSR data, client navigation, pending and error states. |
| `"use server"` + ZSA action | `createServerFn({ method: "POST" })` + validator + middleware | Input, output, domain error, authorization, and retry semantics. |
| ZSA `NOT_AUTHORIZED`/`FORBIDDEN` errors | Stable application error codes mapped at the Start boundary | Existing user-facing message and status behavior. |
| `next/headers` cookies/headers | Start request utilities or request middleware | Cookie bytes/attributes, proxy/IP header behavior. |
| `getCloudflareContext()` | `cloudflare:workers` bindings or typed server request context | Correct binding per request and no secret in client bundle. |
| `redirect()` | TanStack Router `redirect` from `beforeLoad`/loader | Destination, return-to behavior, and loop prevention. |
| `notFound()` | TanStack Router not-found response/component | Correct status and UI for absent and unauthorized resources. |
| `next/link` | TanStack Router `Link` | Params/search type safety, active state, modified clicks. |
| `useRouter`, `usePathname`, `useSearchParams`, `useParams` | TanStack Router navigation/location/search/params APIs | Back/forward navigation, replace vs push, preserved query state. |
| `revalidatePath` | Invalidate the relevant router loader/query after a successful mutation | Fresh UI with no full reload and no cross-team cache bleed. |
| `next/image` | Explicit responsive image component or standard `img` with dimensions/loading rules | URL, dimensions, responsive layout, CLS, failure fallback. |
| `next/font/google` | Self-hosted font assets and CSS variables | No network font dependency, no layout shift, matching typography. |
| `next/dynamic` | Route lazy loading or `React.lazy` as appropriate | Client-only widget loads without hydration errors. |
| Next metadata exports | Route `head` plus root `HeadContent` | Title, description, canonical/robots as applicable, icons, manifest. |
| Next API `route.ts` | Start server route handler returning standard `Response` | Method/path/status/headers/body/stream parity. |
| OpenNext build/deploy | Vite + Cloudflare plugin + Wrangler | Production build, assets, bindings, observability, rollback artifact. |
| OpenNext incremental/tag cache | Explicit loader/query invalidation and application KV cache only where needed | Mutation freshness and authenticated cache isolation. |

## Route parity inventory

TanStack's generated route tree must contain every path below. Route filenames are an implementation choice; URL contracts are not.

### Pages

| Area | Paths | Required behavior |
| --- | --- | --- |
| Marketing/legal | `/`, `/privacy`, `/terms` | SSR content, metadata, navigation, responsive layout, dark mode. |
| Auth | `/sign-in`, `/sign-up` | Anonymous-only guard, validation, generic credential errors, rate limiting, successful session/team provisioning. |
| Dashboard entry | `/dashboard` | Auth guard and current redirect behavior. |
| Recipes | `/recipes`, `/recipes/create`, `/recipes/$id`, `/recipe/$id` | Private/team/public visibility, filters, CRUD, detail editing, public not-found rules. |
| Recipe books | `/recipe-books`, `/recipe-books/create`, `/recipe-books/$id` | CRUD, recipe listing, filters/search state, permissions. |
| Schedule | `/schedule`, `/schedule/create`, `/schedule/$id`, `/schedule/$id/edit` | CRUD, lifecycle status, recipe and grocery interactions, entitlement limits. |
| Grocery templates | `/grocery-templates`, `/grocery-templates/create`, `/grocery-templates/$id` | CRUD and application to a week. |
| Assistant | `/ai-assistant`, `/ai-assistant/chat/$chatId`, `/ai-assistant/usage` | Access policy, redirects, chat ownership, stream behavior, analytics. |
| Settings | `/settings`, `/settings/sessions`, `/settings/teams`, `/settings/teams/$teamSlug/settings`, `/settings/billing`, `/settings/billing/success`, plus the current Next catch-all `/settings/[...segment]` (a TanStack splat route) | Auth/layout guards, redirects, profile, sessions, team settings, billing status, fallback handling. |

### Server-action manifest

Every export below needs a direct Start server-function equivalent or a documented consolidation into a framework-neutral service covered by the same contract vectors. The two `createRecipeBookAction` exports are distinct current exports and must be tracked by file, not name alone.

| Current module | Exports | Feature IDs |
| --- | --- | --- |
| `src/actions/billing.actions.ts` | `createSubscriptionCheckoutAction`, `createBillingPortalAction` | BILL-02 |
| `src/actions/sign-out.action.ts` | `signOutAction` | AUTH-03 |
| `src/actions/team-invites.actions.ts` | `createTeamInviteAction`, `acceptTeamInviteAction`, `cancelTeamInviteAction`, `declineTeamInviteAction`, `acceptTeamInviteByIdAction` | TEAM-02 |
| `src/actions/team-management.actions.ts` | `getUserTeamsAction`, `getTeamMembersAction`, `getTeamInvitationsAction`, `removeTeamMemberAction`, `updateTeamAction`, `changeMemberRoleAction`, `getMyPendingInvitationsAction`, `getMyTeamsPendingInvitationsAction`, `switchTeamAction`, `createTeamAction`, `setDefaultTeamAction` | TEAM-01, TEAM-02, TEAM-03 |
| `src/actions/team-settings.actions.ts` | `getTeamSettingsAction`, `updateRecipeVisibilityModeAction`, `updateDefaultRecipeVisibilityAction`, `updateAutoAddIngredientsAction`, `updateAiSettingsAction` | TEAM-04 |
| `src/app/(auth)/sign-in/sign-in.actions.ts` | `signInAction` | AUTH-02 |
| `src/app/(auth)/sign-up/sign-up.actions.ts` | `signUpAction` | AUTH-01 |
| `src/app/(settings)/settings/settings.actions.ts` | `updateUserProfileAction` | PROFILE-01 |
| `src/app/(settings)/settings/sessions/sessions.actions.ts` | `getSessionsAction`, `deleteSessionAction` | PROFILE-02 |
| `src/app/(dashboard)/ai-assistant/chat.actions.ts` | `getChatHistoryAction`, `createChatAction`, `updateChatTitleAction`, `deleteChatAction` | AI-01 |
| `src/app/(dashboard)/ai-assistant/usage/usage.actions.ts` | `getUsageAnalyticsAction` | AI-05 |
| `src/app/(dashboard)/recipe-books/recipe-books.actions.ts` | `createRecipeBookAction`, `updateRecipeBookAction`, `deleteRecipeBookAction`, `getRecipeBookByIdAction`, `getRecipeBooksAction` | BOOK-01 |
| `src/app/(dashboard)/recipes/recipes.actions.ts` | `createRecipeAction`, `updateRecipeAction`, `deleteRecipeAction`, `getRecipeByIdAction`, `getRecipesAction`, `incrementMealsEatenAction`, `getRecipeMetadataAction`, `getPublicRecipeByIdAction`, `createRecipeBookAction` | PUB-02, REC-01 through REC-05, BOOK-01 |
| `src/app/(dashboard)/recipes/recipe-relations.actions.ts` | `addRecipeRelationAction`, `removeRecipeRelationAction`, `getRecipeRelationsAction`, `reorderRecipeRelationsAction` | REC-06 |
| `src/app/(dashboard)/schedule/weeks.actions.ts` | `createWeekAction`, `updateWeekAction`, `deleteWeekAction`, `getWeekByIdAction`, `getWeeksAction`, `getCurrentAndUpcomingWeeksAction`, `getWeeksForRecipeAction`, `getSchedulePreparationOptionsAction`, `addRecipeToWeekAction`, `removeRecipeFromWeekAction`, `reorderWeekRecipesAction`, `toggleWeekRecipeMadeAction`, `updateWeekRecipeScheduledDateAction` | REC-07, WEEK-01 through WEEK-04 |
| `src/app/(dashboard)/schedule/grocery-items.actions.ts` | `createGroceryItemAction`, `updateGroceryItemAction`, `deleteGroceryItemAction`, `toggleGroceryItemAction`, `reorderGroceryItemsAction`, `bulkUpdateGroceryItemsAction`, `transferGroceryItemsAction`, `getAvailableWeeksForTransferAction` | GROC-01, GROC-02 |
| `src/app/(dashboard)/schedule/grocery-templates.actions.ts` | `createGroceryListTemplateAction`, `updateGroceryListTemplateAction`, `deleteGroceryListTemplateAction`, `getGroceryListTemplateByIdAction`, `getGroceryListTemplatesAction`, `applyTemplateToWeekAction` | GROC-03 |

### External and internal HTTP endpoints

Keep exact paths and methods. For each endpoint test success, unauthenticated, unauthorized/cross-team, invalid input, missing resource, unexpected dependency failure, and method-not-allowed behavior where relevant.

| Contract group | Method and path |
| --- | --- |
| Browser session | `GET /api/get-session` |
| Assistant | `POST /api/assistant`, `POST /api/assistant/stream`, `POST /api/assistant/cancel`, `GET /api/assistant/mentions` |
| Chat compatibility | `GET /api/chat/get`, `GET /api/chat/history`, `GET /api/chat/messages`, `POST /api/chat/update-title` |
| AI analytics | `GET /api/ai-usage/analytics` |
| Mobile auth | `POST /api/mobile/auth/sign-in`, `POST /api/mobile/auth/sign-up`, `POST /api/mobile/auth/sign-out` |
| Mobile workspace/sync | `GET /api/mobile/bootstrap`, `GET /api/mobile/changes`, `POST /api/mobile/mutations`, `POST /api/mobile/sync`, `GET /api/mobile/workspace` |
| Mobile session | `GET /api/mobile/session`, `PATCH /api/mobile/session` |
| Mobile assistant | `POST /api/mobile/assistant`, `POST /api/mobile/assistant/cancel`, `POST /api/mobile/assistant/resume`, `GET /api/mobile/assistant/chats`, `GET /api/mobile/assistant/chats/$chatId`, `PATCH /api/mobile/assistant/chats/$chatId` |
| Mobile push | `PUT /api/mobile/push-device`, `DELETE /api/mobile/push-device` |
| Stripe | `POST /api/stripe/webhook` |

For JSON contracts, compare status, `Content-Type`, cache headers, all response keys, error codes, nullability, date encoding, pagination/cursor rules, and unknown-field behavior. For streaming contracts, compare status, headers, event order, event names, payload shape, terminal events, abort behavior, reconnection, and replay.

## Complete feature coverage matrix

Each ID must be linked to one or more test files before cutover. “E2E” means a user journey; it does not replace service or contract tests.

| ID | Feature behavior to preserve | Required automated coverage |
| --- | --- | --- |
| PUB-01 | Marketing home, legal pages, footer/navigation, icons, manifest, light/dark theme | SSR/router tests, metadata assertions, responsive Playwright smoke, accessibility scan. |
| PUB-02 | Public recipe route reveals only recipes allowed by visibility policy | Worker authorization matrix plus public/hidden/not-found E2E. |
| AUTH-01 | Sign-up validates input, normalizes account identity, rejects duplicate email, creates user/team/settings/owner membership/default team, and creates a session | Unit schemas, D1/KV integration, rollback/partial-failure tests, E2E. |
| AUTH-02 | Sign-in uses case-insensitive email lookup and generic invalid-credential errors | Worker integration and E2E; prove no account enumeration. |
| AUTH-03 | Sign-out invalidates KV session and deletes the browser cookie | Cookie contract and E2E back-button/private-page test. |
| AUTH-04 | Session cookie encoding, hashing, 30-day expiry, version refresh, user refresh, active team selection, and maximum-session eviction | 100% branch coverage with fake clock and KV. |
| AUTH-05 | Auth rate limits use normalized IPv4/IPv6 keys and stable 429 behavior | Worker tests including IPv6 `/64`, expiry window, and fail-closed binding errors. |
| AUTH-06 | Protected layouts redirect anonymous users and anonymous-only pages redirect signed-in users without loops | Router and Playwright tests. |
| PROFILE-01 | User profile update validates and refreshes visible session/user data | Server-function integration, component test, E2E. |
| PROFILE-02 | Session list and individual session revocation preserve the current session rules | D1/KV contract, component test, multi-context E2E. |
| TEAM-01 | List, create, update, switch, set default, and select fallback teams | Service/Worker tests for single/multiple/removed membership and E2E switching. |
| TEAM-02 | List members/invitations, invite, accept, decline, cancel, and remove members | Permission matrix, duplicate/expired invite cases, E2E owner/member journeys. |
| TEAM-03 | Change system/custom roles without privilege escalation or removing required ownership | 100% authorization branch coverage and negative E2E. |
| TEAM-04 | Team recipe visibility mode, default recipe visibility, auto-add ingredients, and AI settings | Schema/service/component tests and persistence E2E. |
| TEAM-05 | Every team-scoped read/write rejects a valid user from another team | Shared cross-tenant contract suite applied to every service/server function/server route. |
| REC-01 | Recipe list loads authorized data and preserves filters, search, sorting, URL state, pagination, cards/table views, empty state | Service query vectors, router search tests, component tests, E2E. |
| REC-02 | Create recipe validates all fields, source/provenance, visibility, ingredients, sections, instructions, tags, meal type, and image/source URL | Schema/service/D1 tests, component test, E2E. |
| REC-03 | View and edit recipe basics, ingredient sections/order, and instructions | Loader/mutation tests, drag/reorder component tests, E2E. |
| REC-04 | Delete recipe enforces permission and cleans or preserves related data according to current schema behavior | D1 integration and E2E confirmation flow. |
| REC-05 | Increment meals eaten and display updated count | Mutation/idempotency expectation and UI invalidation test. |
| REC-06 | Related recipe add/remove/reorder preserves authorization and ordering | D1/service/component/E2E. |
| REC-07 | Add one or all recipe ingredients to a week according to team auto-add settings | Service integration and E2E with enabled/disabled settings. |
| BOOK-01 | Recipe book list/detail/create/update/delete and recipe membership/list display | Service, component, router, and E2E CRUD coverage. |
| WEEK-01 | Week list/board and current/upcoming selection preserve date and lifecycle semantics | Query/service, timezone/date edge cases, component and E2E. |
| WEEK-02 | Create/update/delete arbitrary-length weeks and enforce the free-plan lifetime creation limit | Entitlement/D1 tests with concurrent attempts and E2E upgrade prompt. |
| WEEK-03 | Add/remove/reorder recipes; mark made; set/clear scheduled date | D1/service tests, drag/reorder component tests, E2E. |
| WEEK-04 | Schedule preparation options and recipe browsing by tag return only team-authorized choices | Query and cross-team tests plus component behavior. |
| GROC-01 | Grocery item create/update/delete/toggle/reorder/bulk update | D1/service/component/E2E, including optimistic failure recovery if used. |
| GROC-02 | Transfer selected grocery items between weeks without losing category/order/completion semantics | D1 transaction-equivalent failure tests and E2E. |
| GROC-03 | Grocery template CRUD and application to a week | Service/component/E2E, duplicate/application edge cases. |
| AI-01 | Chat history/create/title/delete and owned-chat access | D1/service/server-route/component/E2E with cross-user and cross-team denial. |
| AI-02 | Assistant request validates chat/run/message context, page mentions, daily usage, monthly budget, token policy, and team AI policy | 100% access-control branches and stable public error contract. |
| AI-03 | Assistant stream supports partial output, completion, error, cancellation, resume/replay, disconnect, and missing durable stream retry | Byte/event-level contract tests with a fake service binding plus E2E. |
| AI-04 | Mention search and insertion avoid email false positives and enforce authorized context | Existing unit tests, endpoint contract, component keyboard test. |
| AI-05 | Usage analytics preserves summary, recent requests, daily/model/user statistics, and finish reasons | Response-shape and authorization tests plus component states. |
| AI-06 | AI logs and client errors redact internals while retaining correlation IDs and supported status codes | Existing security tests expanded to server boundaries. |
| BILL-01 | Billing page reflects free, trialing, active, past-due/canceled, and grandfathered entitlement snapshots | Unit/service/loader/component/E2E fixtures. |
| BILL-02 | Checkout creation validates team authority and configured Stripe price; portal creation requires a customer | Server-function contract with Stripe fake and E2E redirect assertion. |
| BILL-03 | Success return refreshes subscription state without trusting query parameters | Loader/service and E2E tests. |
| BILL-04 | Webhook verifies the signature against untouched raw bytes, handles every subscribed event, duplicates, retries, and out-of-order delivery | 100% branch coverage and signed fixture integration. Stripe requires the raw request body for signature verification; any parsing before verification is a release blocker. |
| MOB-01 | Mobile sign-up/sign-in/sign-out match web identity/session rules and stable mobile error envelopes | HTTP contract suite and iOS consumer fixtures. |
| MOB-02 | Bootstrap/workspace/session endpoints preserve active-team and capability payloads | Snapshot/schema contract, cross-team and stale-default tests. |
| MOB-03 | Sync, changes, and mutations preserve aliases, IDs, cursors, batch limits, conflict rules, dedupe, ordering, and unknown-field rejection | Existing contract tests plus D1/HTTP integration and replay tests. |
| MOB-04 | Mobile assistant request/chat/cancel/resume keeps the stable mobile protocol while the upstream assistant protocol evolves | Byte/event contract fixtures shared with the Swift tests. |
| MOB-05 | Push device registration/deletion validates app-scoped APNs tokens and sign-out suppression | Existing unit tests plus authenticated HTTP/D1 integration. |
| INFRA-01 | D1 migrations apply from empty and upgrade states in the Worker test runtime | Migration test in CI. |
| INFRA-02 | KV sessions/rate limits/cache keys survive the cutover with no namespace change | Read/write compatibility test against a seeded namespace fixture. |
| INFRA-03 | `ASSISTANT` and `WORKER_SELF_REFERENCE` bindings resolve and failures map to stable errors | Worker integration with success, timeout, malformed response, and unavailable binding. |
| INFRA-04 | Static assets, font files, images, icons, manifest, and deep-link fallback deploy correctly | Production preview smoke and asset header tests. |
| INFRA-05 | Secrets are server-only; authenticated responses are never publicly cached | Bundle inspection, response-header tests, and cache isolation tests with two users/teams. |
| A11Y-01 | Every migrated route has no new automated accessibility violations and all forms/dialogs are keyboard operable | Component semantics plus Playwright/axe scan; retain manual review for issues automation cannot detect. |
| PERF-01 | LCP/CLS and route transition performance do not regress beyond the approved budget | Repeatable preview measurements and asset/bundle budgets. |

## Implementation phases

### Phase 0: Freeze observable contracts

Goal: make the current Next implementation executable as a specification.

1. Add the feature IDs above to test names or test metadata.
2. Add route inventory tests for all 30 page routes and all endpoint methods.
3. Add HTTP snapshot helpers that record normalized status, headers, JSON, and stream events.
4. Add missing tests to the Next app before moving code.
5. Measure and record current coverage, route HTML, key screenshots, bundle sizes, and performance.
6. Run GitNexus change detection before committing the baseline tests.

Exit criteria:

- Every matrix row is marked `covered`, `planned with test file`, or explicitly `not currently implemented`; no row is silently omitted.
- The existing Next suite is green in CI.
- Baseline artifacts are stored as test fixtures, not copied from production secrets or private user data.

### Phase 1: Scaffold Start and the test harness

Goal: deploy an empty but production-realistic Start Worker without touching the production app.

1. Create `apps/web-start` with pnpm and pin TanStack Start, Router, Vite, React, the Cloudflare Vite plugin, Wrangler, Vitest, the Workers Vitest integration, Testing Library, and Playwright as one reviewed compatibility set.
2. Configure Vite in the documented order: Cloudflare plugin, TanStack Start plugin, React plugin.
3. Add `src/router.tsx`, `src/routes/__root.tsx`, `src/start.ts`, and `src/server.ts`.
4. Preserve the existing binding names initially. Add a typed runtime adapter so application code asks for `db` and `sessions`, not `NEXT_TAG_CACHE_D1` and `NEXT_INC_CACHE_KV`.
5. Configure a separate preview Worker name and isolated preview D1/KV resources. Never point local tests or preview mutation tests at production data.
6. Add global CSRF middleware for server functions if defining custom `src/start.ts`; Start's documentation notes that custom start configuration must explicitly retain this protection.
7. Prove deep-link SSR, asset delivery, D1, KV, service binding fakes, errors, logs, and source maps.

Illustrative configuration:

```typescript
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
  ],
});
```

Exit criteria:

- `pnpm --filter @food-tracker/web-start build` succeeds.
- A Wrangler preview responds through the Start Worker entry point.
- Worker tests can read/write isolated D1 and KV and call a fake `ASSISTANT` binding.
- No production domain or resource is attached.

### Phase 2: Extract request, persistence, auth, and error adapters

Goal: remove framework globals from the domain boundary.

1. Introduce request-scoped ports for D1, KV, cookies, headers, Cloudflare metadata, clock, IDs, and service bindings.
2. Move stable application error codes out of ZSA so both boundaries can map them. Preserve current messages and distinguish authentication, authorization, validation, conflict, not found, rate limit, and internal failures.
3. Keep existing session cookie name, value encoding, hashing, expiry, `SameSite`, `Secure`, `HttpOnly`, and `Path` behavior.
4. Replace React `cache()` session memoization with explicit request-scoped memoization. Never share a session result across requests.
5. Preserve lowercase email matching and team fallback logic.
6. Test old cookies against the Start parser and Start-created cookies against the old parser.

Exit criteria:

- AUTH-01 through AUTH-06 and TEAM-05 pass at the service/Worker layer.
- The same session fixture is accepted by both apps.
- A two-user/two-team cache-isolation test proves no data crosses identities.

### Phase 3: Migrate the root shell and public routes

Goal: prove routing, SSR, CSS, assets, metadata, fonts, themes, and not-found handling on low-risk routes.

1. Port global CSS, providers, root document, scripts, toasts, and theme initialization.
2. Self-host the Rosarivo and Raleway font files instead of relying on `next/font/google`.
3. Port marketing and legal layouts/pages.
4. Port the public recipe route through a server function and loader, with authorization in the server function.
5. Create shared image behavior with explicit dimensions and responsive loading rules.

Exit criteria:

- PUB-01, PUB-02, INFRA-04, A11Y-01, and the initial performance baseline pass.
- Direct navigation and client navigation produce the same content and status.

### Phase 4: Migrate authentication and protected layouts

Goal: establish the security boundary before private feature routes.

1. Port sign-in, sign-up, and sign-out server functions.
2. Put session lookup in server-side middleware and pass only the minimum safe session projection into route context.
3. Use route `beforeLoad` only for user experience. Every private server function and server route must still authenticate and authorize independently because server functions are directly reachable endpoints.
4. Port Turnstile and rate-limit behavior without exposing secrets.
5. Port dashboard and settings pathless layouts and redirects.

Exit criteria:

- AUTH and PROFILE rows pass in Worker, router, component, and E2E projects.
- Direct calls to every private server function fail safely without a session even if the UI route guard is bypassed.

### Phase 5: Migrate teams and settings

Goal: prove multi-tenancy before feature data.

1. Port team service functions, invitations, role changes, active/default team selection, and settings.
2. Centralize `requireTeamPermission` as middleware or a middleware factory backed by server-trusted session state.
3. Validate route params/search shape and separately verify membership/permission. A valid team ID is not authorization.
4. Port profile, sessions, team settings, and settings navigation.

Exit criteria:

- TEAM-01 through TEAM-05 pass.
- A generated cross-tenant matrix calls every migrated private endpoint with the wrong team and expects denial without existence leakage.

### Phase 6: Migrate recipes and recipe books

Goal: migrate one complete content vertical.

1. Extract recipe and recipe-book application services behind current ZSA actions.
2. Port list loaders with validated search parameters.
3. Port create/detail/edit/delete mutations and invalidation.
4. Port ingredient and instruction editing, related recipes, public visibility, image behavior, meal counts, and add-to-schedule entry points.
5. Keep D1 schema and IDs unchanged.

Exit criteria:

- REC-01 through REC-07 and BOOK-01 pass.
- Playwright completes create, edit, relate, make public/private, add ingredients, and delete journeys with no full-page-only workaround.

### Phase 7: Migrate schedule, groceries, templates, and entitlements

Goal: preserve the most mutation-heavy UI and its ordering/date rules.

1. Port week loaders and lifecycle rules.
2. Port week CRUD, recipe add/remove/reorder/made/scheduled-date mutations.
3. Port grocery CRUD, bulk actions, reorder, transfer, and templates.
4. Replace each `revalidatePath` with precise router/query invalidation after confirmed success.
5. Verify free-plan lifetime limits under concurrent create attempts.
6. Verify all drag-and-drop flows by resulting persisted order, not library implementation details.

Exit criteria:

- WEEK and GROC rows pass.
- A failed mutation restores or refetches the correct UI state.
- No authenticated loader response is marked `public` cacheable.

### Phase 8: Migrate assistant and analytics

Goal: preserve streaming and security boundaries byte-for-byte where clients depend on them.

1. Keep `handleAssistantRequest`, stream, cancel, and resume logic framework-neutral and expose it through raw Start server routes.
2. Preserve `Request.signal` propagation to the assistant service binding.
3. Do not buffer streaming responses in middleware, logging, error mapping, or tests.
4. Port browser chat UI, mentions, history/title/delete, usage analytics, error mapping, and reconnect behavior.
5. Treat a disconnect separately from an explicit cancel.

Exit criteria:

- AI-01 through AI-06 pass.
- Event-level parity fixtures match for success, partial failure, cancel, reconnect, replay, and authorization failure.
- Live-provider evaluation remains a separate release gate, not a deterministic CI dependency.

### Phase 9: Migrate billing and Stripe webhook

Goal: preserve entitlement state without trusting framework parsing or event order.

1. Port checkout and portal calls as authenticated server functions.
2. Port billing loaders and success route.
3. Port `/api/stripe/webhook` as a raw server route. Read the request body exactly once as raw text/bytes and verify the Stripe signature before JSON parsing.
4. Rebuild subscription state idempotently from authoritative Stripe objects as the existing design requires.
5. Run signed fixtures plus Stripe CLI preview tests.

Exit criteria:

- BILL-01 through BILL-04 pass.
- Duplicate and out-of-order events converge to the same state.
- Invalid signatures produce 400 and no database writes.

### Phase 10: Migrate mobile APIs and push registration

Goal: make the Start Worker a drop-in server for the existing iOS app.

1. Port mobile auth/session/workspace routes.
2. Port bootstrap, changes, mutations, and combined sync routes.
3. Port assistant chat/cancel/resume routes using the stable mobile protocol adapter.
4. Port push device registration/deletion.
5. Run the same captured contract vectors against Next and Start.
6. Run Swift consumer/decoding tests against Start fixtures and a staging build of the iOS app against the Start preview.

Exit criteria:

- MOB-01 through MOB-05 pass.
- An existing signed-in mobile session survives a web Worker switch.
- Offline mutation replay, duplicate delivery, stale cursor, and cross-team attempts are proven.

### Phase 11: Remove OpenNext and complete infrastructure parity

Goal: eliminate Next/OpenNext dependencies only after all product behavior runs on Start.

1. Point Start's Worker config at the Start server entry point or a custom `src/server.ts` if additional Worker exports are required.
2. Preserve the application D1, KV, service bindings, vars, secrets, observability, placement, routes, and compatibility flags.
3. Remove OpenNext's incremental cache, tag cache, and `DOQueueHandler` only after tests prove they are not application dependencies.
4. Optionally rename bindings in a separate follow-up change:
   - `NEXT_TAG_CACHE_D1` to `DB`
   - `NEXT_INC_CACHE_KV` to `SESSIONS_KV` or a deliberately broader `APP_KV`
5. If bindings are renamed, update adapters and run `pnpm run cf-typegen`; do not combine the rename with production cutover.
6. Remove Next, OpenNext, ZSA, `next-themes`, `nextjs-toploader`, and other Next-only dependencies only after `rg` and bundle inspection show no remaining use.

Exit criteria:

- INFRA-01 through INFRA-05 pass.
- No import from `next`, `next/*`, or `@opennextjs/cloudflare` remains in the Start app or shared packages.
- Production build and Worker test suites use the same Wrangler binding contract.

### Phase 12: Cutover and rollback

Goal: switch traffic without a data migration and retain a fast reversal path.

1. Build immutable Next and Start deployment artifacts from the same commit.
2. Run `test:migration`, D1 migration verification, contract tests, accessibility scans, and preview smoke tests.
3. Test Start at a preview hostname with isolated writable data. Use sanitized snapshots or fixtures, never copied session tokens.
4. Run read-only parity checks against production-shaped data.
5. Deploy Start to production with the existing D1/KV/service bindings and domain.
6. Run smoke tests for sign-in, session continuity, team switch, recipe read, week read, assistant access denial/success, billing read, mobile bootstrap, and webhook health.
7. Monitor 4xx/5xx rates, auth failures, D1/KV errors, assistant stream completion, webhook failures, and mobile sync errors.
8. Keep the last Next artifact and its configuration ready for immediate redeploy for at least one release window.

Rollback is a Worker deployment rollback only. Do not introduce a framework-specific database migration, so both artifacts remain compatible with the same data. If Start creates any new cache keys, namespace them and make them safe for the old app to ignore.

## CI release gates

Every pull request during migration must pass:

1. Formatting/linting and `tsc --noEmit`.
2. Unit, component, router, Worker, and contract tests.
3. Coverage thresholds, including 100% on critical modules.
4. TanStack route inventory generation test.
5. Production Start build.
6. Secret/client-bundle inspection.
7. D1 migrations-from-empty test.
8. GitNexus `detect_changes({ scope: "compare", base_ref: "main" })` review before commit/merge.

The release candidate additionally requires:

1. Full Playwright Chromium and WebKit suites.
2. Accessibility scan plus manual keyboard/screen-reader spot checks for changed primitives.
3. Mobile staging compatibility test.
4. Stripe CLI webhook test.
5. Assistant release evaluation gate.
6. Preview performance and error-rate comparison.
7. Documented rollback owner and exact previous deployment identifier.

## High-risk migration traps

### Server functions are endpoints

Do not rely on route `beforeLoad` for data protection. Apply authentication and team authorization to every private server function and server route. Keep CSRF middleware active for same-origin server functions. Never trust client-sent middleware context as identity.

### Isomorphic loaders

TanStack route loaders can execute on the server for initial SSR and in the browser during client navigation. They must not directly import D1, KV, secrets, or server-only modules. Call server functions from loaders.

### Existing binding names hide two responsibilities

`NEXT_TAG_CACHE_D1` and `NEXT_INC_CACHE_KV` are OpenNext-shaped names but are also application persistence. Removing them with OpenNext would break the database, sessions, rate limits, and caches. Introduce semantic adapters first; rename resources later.

### Request-scoped session memoization

The current auth code uses React `cache()` around session lookup. Replacing it with a module-global promise or cached user would leak identity across requests. Memoize only in request context.

### Cache safety

Authenticated server functions must return `private` or `no-store` responses as appropriate, never shared `public` cache entries. Explicitly test two users and two teams requesting the same URL.

### ZSA behavior

ZSA currently defines validation, tuple/error behavior, and codes used by UI components. Move domain errors into a framework-neutral type and use a temporary adapter so UI migration does not silently change messages or success/error handling.

### Streaming

Assistant routes depend on unbuffered response streams, abort signals, reconnect/replay, and stable mobile transforms. Generic JSON middleware, response logging, or exception wrappers can consume or buffer a stream. Test bytes and event order.

### Stripe raw body

Stripe signature verification fails if the body changes before verification. The Start route must verify raw bytes before parsing, as required by [Stripe's webhook documentation](https://docs.stripe.com/webhooks?lang=node).

### Images, fonts, metadata, and hydration

`next/image`, `next/font`, metadata exports, `next/dynamic`, and server/client boundaries do not have automatic one-line equivalents. Test layout shift, intrinsic sizes, client-only widgets, document head, theme hydration, and deep links.

### Dates and serialization

Current server actions may transport `Date` values through framework serialization. Raw HTTP APIs use explicit JSON. Define contract serializers for application services and test dates, nulls, optional values, and cursor round trips rather than assuming the Start serializer matches ZSA/Next.

## Pull request slicing

Keep reviews vertical and reversible:

1. Baseline tests and fixtures only.
2. Start scaffold and Worker test harness.
3. Runtime adapters and error contracts.
4. Auth/session and protected layouts.
5. Public shell/routes.
6. Teams/settings.
7. Recipes/books.
8. Schedule/groceries.
9. Assistant.
10. Billing/webhook.
11. Mobile APIs.
12. Infrastructure cleanup.
13. Cutover configuration.

Each PR must state:

- Feature IDs added or migrated.
- Next routes/actions and Start routes/functions covered.
- Direct callers and affected execution flows from GitNexus impact/change analysis.
- Tests added at each layer.
- Any normalized differences accepted by contract tests.
- Preview URL and rollback step.

## Final cutover checklist

- [ ] All feature IDs are linked to green tests.
- [ ] All page and endpoint route inventory tests pass.
- [ ] All 79 server-action export behaviors have a Start server-function or intentionally consolidated service/raw-route equivalent.
- [ ] All 26 API route files have method/path/status/header/body parity.
- [ ] Cross-team denial matrix is green.
- [ ] Session and cookie bidirectional compatibility is green.
- [ ] Mobile staging app passes auth, bootstrap, sync, mutations, assistant, and push registration.
- [ ] Stripe signed, duplicate, retry, and out-of-order fixtures pass.
- [ ] Assistant stream, cancel, resume, replay, and disconnect fixtures pass.
- [ ] D1 migrations apply from empty and representative upgrade states.
- [ ] Production build passes in Workers runtime with real binding types.
- [ ] No secrets or server modules appear in client chunks.
- [ ] Accessibility and performance gates pass.
- [ ] OpenNext-only caches/DO are proven unused before removal.
- [ ] Observability dashboards and alerts distinguish the Start deployment.
- [ ] Previous Next deployment identifier and rollback command are recorded.
- [ ] Post-cutover smoke suite is ready and owned.

## Success criteria

The migration succeeds when users and external clients cannot tell that the framework changed, except for approved performance or developer-experience improvements. URLs, data visibility, permissions, persistence, sessions, billing, streaming, mobile synchronization, accessibility, and failure behavior remain stable; the new system is protected by a durable feature-level test suite that makes future changes safer than the current baseline.
