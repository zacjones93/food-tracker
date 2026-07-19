# Mobile sync contract

Food Tracker uses the Next.js app in `apps/web` as the authenticated source of truth for D1. The Swift app is local-first: it writes to its per-user and per-team store, appends an outbox mutation, then reconciles with these APIs when connectivity returns.

## Authentication

All responses use `Cache-Control: no-store`. Cookies are HttpOnly and managed by shared `HTTPCookieStorage` on iOS. Every `POST` or `PATCH` request must send an `Origin` header equal to the API base origin.

- `POST /api/mobile/auth/sign-in`
- `POST /api/mobile/auth/sign-up`
- `POST /api/mobile/auth/sign-out`
- `GET /api/mobile/session`
- `PATCH /api/mobile/session` with `{ "teamId": "team_..." }`

The session response contains only the sanitized user, active team, available active memberships, effective permissions, and protocol version. Each data request rechecks that the user still has an active membership in the session's active team.

Sign-up provisions a personal team and an active owner membership through the same server service used by web sign-up, stores that team as the account default, and then creates the session. Sign-in uses the stored default only while its membership remains active; otherwise it deterministically falls back to the oldest active membership and repairs the stale default. Accounts without an active membership cannot open a mobile workspace.

Switching teams updates only the current KV session after verifying an active membership. The iOS app then changes to a separate `{userId, teamId}` local workspace before syncing, so cached data and pending mutations cannot cross teams.

## Bootstrap and pull

- `GET /api/mobile/bootstrap`
- `GET /api/mobile/workspace`
- `GET /api/mobile/changes?cursor={sequence}&limit=200`

Bootstrap and workspace return the complete authorized snapshot:

```json
{
  "protocolVersion": 1,
  "cursor": "42",
  "recipes": [],
  "weeks": [],
  "weekRecipes": [],
  "groceryItems": [],
  "recipeBooks": [],
  "groceryTemplates": [],
  "recipeRelations": [],
  "versions": []
}
```

The cursor is captured before the snapshot is read, so a concurrent change remains eligible for the next incremental pull. Changes contain the canonical record for upserts and `record: null` for tombstones. Legacy global recipe books and grocery templates are included as read-only data; new recipe books and templates are team-owned.

## Push and reconcile

- `POST /api/mobile/mutations` applies an outbox batch and returns acknowledgements plus conflicts.
- `POST /api/mobile/sync` applies the batch and also returns a complete canonical workspace.

Mutations are processed in dependency order: books and templates, recipes and weeks, relations, scheduled recipes, then grocery items.

```json
{
  "cursor": "42",
  "mutations": [
    {
      "mutationId": "device-generated-uuid",
      "entityType": "recipe",
      "operation": "update",
      "clientEntityId": "device-record-uuid",
      "serverEntityId": "rcp_...",
      "baseVersion": 3,
      "baseUpdatedAt": "2026-07-15T12:00:00.000Z",
      "changedFields": ["ingredients", "recipeBody"],
      "payload": {}
    }
  ]
}
```

Supported entity types are `recipeBook`, `groceryTemplate`, `recipe`, `week`, `recipeRelation`, `weekRecipe`, and `groceryItem`. Creates use a stable `clientEntityId`; the server returns its generated canonical ID. Later updates and deletes may address either canonical IDs or the stable client ID.

Mutation IDs are receipts. Retrying the same ID returns the stored result. Retrying a completed create with the same client entity ID returns the original canonical record without emitting a false new change. A client ID retired by a delete cannot be reused.

## Conflict behavior

The server compares `baseVersion`, changed fields, and the canonical domain `updatedAt`. Overlapping changes and any timestamp change not represented in the client's base return a conflict with the canonical record. Delete uses `changedFields: ["*"]`, so it cannot silently erase a newer edit. The Swift app preserves the local draft while presenting or resolving the conflict.

Every successful mobile mutation writes:

- the domain record in D1;
- `sync_entities` version and client-ID metadata;
- an ordered `sync_changes` upsert or tombstone;
- a `sync_mutations` idempotency receipt.

The `/sync` response always includes a complete workspace. This also reconciles edits made by existing web actions that predate the incremental change recorder.
