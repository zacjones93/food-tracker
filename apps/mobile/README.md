# List To Ladle for iOS

List To Ladle is a dependency-free SwiftUI companion to the web app. Recipes, meal plans, grocery lists, recipe books, and grocery templates share one Cloudflare D1-backed team workspace while every edit is saved locally first.

## Offline and sync behavior

- Each signed-in user/team pair receives a separate JSON workspace protected by iOS file protection.
- Team switching is limited to active memberships returned by the session API and swaps the local workspace before syncing.
- Creates, edits, toggles, and deletes update the visible local workspace before any network request.
- The durable outbox coalesces repeated edits to the same entity under one idempotency key.
- Reconnect and foreground activation retry pending changes, then merge newer server state.
- A server refresh cannot overwrite a local entity that still has a pending mutation.
- The native app uses the server-resolved team from `/api/mobile/session`; it never accepts a caller-provided team ID.

## Mobile API contract

The app expects authenticated, JSON endpoints on the web app origin:

- `GET /api/mobile/session`
- `POST /api/mobile/auth/sign-in`
- `POST /api/mobile/auth/sign-up`
- `POST /api/mobile/auth/sign-out`
- `GET /api/mobile/workspace?cursor=<opaque>`
- `POST /api/mobile/sync`
- `GET /api/mobile/assistant/chats`
- `GET /api/mobile/assistant/chats/:chatId`
- `PATCH /api/mobile/assistant/chats/:chatId`
- `POST /api/mobile/assistant`

`POST /api/mobile/sync` receives an opaque cursor and mutations shaped as `{ mutationId, entityType, operation, clientEntityId?, serverEntityId?, baseVersion?, baseUpdatedAt?, clientUpdatedAt, changedFields, payload }`. The mutation UUID is the idempotency key. The response supplies `{ acknowledged, conflicts, cursor, workspace }`; each acknowledgement maps the client entity to its canonical D1 string ID.

The assistant uses stable conversation IDs, loads team- and user-scoped history from D1, and consumes the AI SDK UI message stream through the mobile assistant bridge. The native client renders text and tool progress as events arrive and can cancel an in-flight run. The assistant remains online-only; the rest of the planning and shopping workflow stays available offline.

The debug configuration targets `http://localhost:3000`. Set `FoodTrackerAPIBaseURL` in the app target's generated Info.plist settings for another environment.

## Build and test

Open `FoodTracker.xcodeproj`, or run:

```bash
xcodebuild -project FoodTracker.xcodeproj -scheme FoodTracker -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/FoodTrackerDerivedData CODE_SIGNING_ALLOWED=NO test
```

The app requires iOS 18 or newer and has no third-party iOS dependencies.
