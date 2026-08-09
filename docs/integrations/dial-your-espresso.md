# List To Ladle → Dial Your Espresso provider contract

Status: version 1, provider implementation in List To Ladle. Dial is the consumer. This contract is additive; breaking changes require a new `schemaVersion`.

## Ownership and eligibility

List To Ladle is the sole owner and editor of recipe definitions. A recipe participates when `recipeType` is `coffee_drink`; there is no export flag. Listo visibility maps as follows:

| Listo visibility | Dial audience | Team pairing required |
| --- | --- | --- |
| `public` | `global`; searchable/browsable by every signed-in Dial user | No |
| `unlisted` | `direct_link`; excluded from browse/search | No |
| `private` | `paired_team`; only the paired Dial team | Yes |

Changing a coffee drink back to `standard`, deleting it, or removing a required pairing produces a withdrawal. Visibility/audience transitions are expressed as a later upsert or withdrawal for the same stable external recipe ID.

## Transport

Dial calls List To Ladle's named Cloudflare Service Binding entrypoint `DialProvider` for connection, backfill, and edit-capability RPC. List To Ladle publishes complete validated events to the `listo-dial-recipe-events` Cloudflare Queue, and Dial is the sole consumer.

The Queue is at-least-once. Dial deduplicates by `eventId` and retains the greatest `revision` per `recipeId`. Ordinary List To Ladle saves do not wait for Dial delivery. A five-minute scheduled drain re-enqueues outbox rows whose first Queue send failed, and backfill repairs any remaining availability gap.

## Service Binding RPC

The Dial Worker should declare a binding to the Listo service with `entrypoint: "DialProvider"` and call these methods:

### `beginConnectionIntent(input)`

Input:

```json
{
  "requestedScopes": ["account", "team"],
  "dialUserRef": "opaque Dial user reference",
  "dialUserLabel": "display-only label",
  "dialTeamRef": "opaque Dial team reference",
  "dialTeamLabel": "display-only label",
  "emailHint": "discovery-only@example.com",
  "returnUrl": "https://dialyourespresso.online/integrations/listo/complete"
}
```

The account fields are required for `account`; team fields are required for `team`. The return URL must have the configured Dial origin. Result:

```json
{
  "intentToken": "single-use opaque token",
  "approvalUrl": "https://listtoladle.com/integrations/dial/connect?intent=...",
  "expiresAt": "2026-08-08T12:10:00.000Z"
}
```

Dial sends the signed-in user to `approvalUrl`. Listo authenticates the user, displays the requested layers, and obtains explicit approval. Team approval requires `edit_team_settings` on the active Listo team. Listo redirects to the validated `returnUrl` with `listo_intent=<token>`.

Email is a display/discovery hint only. It is never read during authorization, approval, or consumption.

### `consumeConnectionIntent({ intentToken })`

Only an authenticated service-bound Dial caller should consume the approved intent. The first successful call creates the requested account link and/or team pairing and returns opaque integration IDs:

```json
{
  "accountLinkId": "dal_opaque",
  "teamPairingId": "dtp_opaque",
  "replayed": false
}
```

Replaying the same consumed intent is safe and returns the same IDs with `replayed: true`. An intent expires after ten minutes and cannot be approved for a different user/team through email matching. A Dial account or team reference cannot be attached to a second Listo principal.

### `getRecipeBackfill({ cursor?, limit?, teamPairingId? })`

Returns versioned recipe projections in stable external-ID order. `limit` defaults to 100 and is capped at 200. Public and unlisted recipes are returned without a team pairing. A valid active `teamPairingId` additionally includes private recipes owned by its paired Listo team.

```json
{
  "contract": "listo-dial",
  "schemaVersion": 1,
  "items": [{ "audience": { "scope": "global" }, "recipe": {} }],
  "nextCursor": "lst_recipe_opaque"
}
```

### `checkEditCapability({ accountLinkId, recipeId })`

This is deliberately narrow and current-state based. Listo resolves the active individual account link and checks `edit_recipes` on the recipe-owning team at call time.

```json
{ "canEdit": true, "editUrl": "https://listtoladle.com/integrations/dial/recipes/lst_recipe_opaque/edit" }
```

Otherwise it returns `{ "canEdit": false }`. Dial may show “Edit in List To Ladle” only for the true result. The edit URL authenticates the Listo user and rechecks the same permission before opening the editor; the capability response is not an authorization grant.

## Event envelope

Every event has `contract: "listo-dial"`, `schemaVersion: 1`, a unique idempotency key `eventId`, an ISO-8601 `occurredAt`, stable external `recipeId`, and monotonically increasing positive `revision`.

Upsert:

```json
{
  "contract": "listo-dial",
  "schemaVersion": 1,
  "eventId": "lst_recipe_opaque:v7",
  "eventType": "recipe.upsert",
  "occurredAt": "2026-08-08T12:00:00.000Z",
  "recipeId": "lst_recipe_opaque",
  "revision": 7,
  "audience": { "scope": "paired_team", "teamPairingId": "dtp_opaque" },
  "recipe": {
    "id": "lst_recipe_opaque",
    "revision": 7,
    "type": "coffee_drink",
    "name": "Cortado",
    "emoji": "☕️",
    "tags": ["espresso"],
    "ingredients": [{ "items": ["18 g espresso", "60 g milk"] }],
    "instructions": "Pull, steam, combine.",
    "visibility": "private",
    "listoUrl": "https://listtoladle.com/integrations/dial/recipes/lst_recipe_opaque"
  }
}
```

For public recipes, audience is `{ "scope": "global" }`; for unlisted it is `{ "scope": "direct_link" }`.

Withdrawal:

```json
{
  "contract": "listo-dial",
  "schemaVersion": 1,
  "eventId": "lst_recipe_opaque:v8",
  "eventType": "recipe.withdraw",
  "occurredAt": "2026-08-08T12:05:00.000Z",
  "recipeId": "lst_recipe_opaque",
  "revision": 8,
  "reason": "recipe_type_changed"
}
```

Reasons are `recipe_deleted`, `recipe_type_changed`, `team_pairing_required`, or `team_pairing_disconnected`. A withdrawal removes the projected recipe from all Dial audiences at lower revisions.

## Data minimization and client links

The projection is intentionally limited to display/preparation fields. It never contains Listo user IDs, Listo team IDs, database recipe IDs, account secrets, connection tokens, or database internals. Only stable public recipe IDs and opaque integration link/pairing IDs cross the service boundary.

Canonical Listo recipe links are Universal Links at `/integrations/dial/recipes/{recipeId}` and edit links append `/edit`. The website provides the fallback. The iOS associated-domain configuration handles those recipe paths; connection approval remains on the authenticated web route.

Runtime validators are defined in `apps/web/src/lib/dial-contract.ts` and are the executable source of truth for version 1.

## Cloudflare setup required before release

The repository contains configuration only and does not create or deploy remote resources. Operations must:

1. Create `listo-dial-recipe-events` and its dead-letter queue `listo-dial-recipe-events-dlq`.
2. Configure Dial as the Queue's sole consumer with the dead-letter queue above.
3. Add Dial's binding to the deployed List To Ladle service with named entrypoint `DialProvider`.
4. Apply D1 migration `0041_dial_your_espresso_integration.sql` through the normal release workflow.
5. Deploy the AASA response and confirm `https://listtoladle.com/.well-known/apple-app-site-association` is served without redirects.
