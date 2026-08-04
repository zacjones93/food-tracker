# List To Ladle notifications Worker

This Worker contains the production-shaped APNs delivery seam for the notification-system RFC. Production notification generation is intentionally unavailable until the Apple and Cloudflare provisioning gates below are complete.

## Current safety state

- `NOTIFICATIONS_ENABLED`, `PUSH_ENABLED`, and `PUSH_TEST_ENABLED` are `false` in both environments.
- The iOS `PUSH_NOTIFICATIONS_AVAILABLE` Swift compilation condition is absent; notification settings are hidden and automatic APNs registration is blocked even for an entitled account.
- Sandbox and production use different Worker environments, delivery queues, dead-letter queues, APNs hosts, and token rows.
- Every provider call rechecks active team membership, the user/team push preference, the enabled device row, its bundle ID, and its APNs environment after acquiring a delivery lease.
- A unique `(pushDeviceId, dedupeKey)` constraint makes outbox creation idempotent. A compare-and-set status/lease prevents concurrent sends and terminal-row replays. An acceptance-before-D1-commit failure can still cause an uncertain retry: the same `apnsId` and collapse ID are reused, but APNs does not promise exactly-once device presentation.
- APNs acceptance is stored as `accepted`, never `delivered`.
- APNs invalid-token responses disable the exact rejected token before the delivery is failed. The token-qualified update cannot disable a token that rotated concurrently.
- The authenticated sandbox test route accepts only a persisted `deliveryId` and uses the same membership, preference, device, lease, and delivery-state checks as the queue consumer. It cannot send to an arbitrary token.
- The scheduler does not generate events, preferences, delivery rows, or queue messages yet. `/health` reports `eventGenerationReady: false`.

The queue contract is:

```json
{
  "kind": "push_delivery",
  "deliveryId": "pushdel_...",
  "environment": "sandbox"
}
```

A future producer must explicitly opt the user into the exact delivery topic by writing `notification_push_preferences.pushEnabled = true`, insert a delivery with a UUID `apnsId`, use the unique delivery dedupe key, and enqueue only to the matching environment queue. If enqueueing fails, an outbox repair job must find and enqueue the still-pending row.

## Local verification

```bash
pnpm --filter @food-tracker/notifications check
pnpm --filter @food-tracker/notifications deploy:dry-run
pnpm --filter @food-tracker/notifications deploy:dry-run:production
pnpm --filter @food-tracker/web db:migrate:local
```

Migration `0038_add-push-delivery-state.sql` must remain after `0036_add-push-devices.sql` because the delivery table references the device table; `0039_scope-push-preferences-by-topic.sql` then makes each opt-in topic-specific. Migration `0037_add-apple-subscriptions.sql` is the intervening StoreKit migration in the shared D1 lineage.

## Apple provisioning checklist

Do not enable either delivery kill switch until all items are complete:

1. In Apple Developer → Certificates, Identifiers & Profiles, use the explicit App ID `com.wodsmith.listtoladle` and enable the Push Notifications capability.
2. Create or select an APNs token-signing key with Apple Push Notifications service access. Download the `.p8` file once and record its Key ID and the account Team ID. Never commit the key.
3. In Xcode, confirm the FoodTracker target uses bundle ID `com.wodsmith.listtoladle`, `FoodTracker/FoodTracker.entitlements`, and the Push Notifications capability.
4. Regenerate/download signing profiles after enabling the capability. The Debug-signed app must contain `aps-environment=development`; the Release/App Store archive must contain `aps-environment=production`.
5. Verify build settings before archiving:

   ```bash
   xcodebuild -project apps/mobile/FoodTracker.xcodeproj \
     -scheme FoodTracker -configuration Release -showBuildSettings \
     | rg 'APS_ENVIRONMENT|CODE_SIGN_ENTITLEMENTS|PRODUCT_BUNDLE_IDENTIFIER'
   ```

6. Export the archive/IPA and inspect the signed app, not only the source entitlement:

   ```bash
   codesign -d --entitlements :- Payload/FoodTracker.app
   security cms -D -i Payload/FoodTracker.app/embedded.mobileprovision
   ```

7. Only for an authorized device-verification build, add `PUSH_NOTIFICATIONS_AVAILABLE` to `SWIFT_ACTIVE_COMPILATION_CONDITIONS`. Install the signed sandbox build on a user-controlled device, grant notification permission, and confirm its registration row says `sandbox`. Repeat with an authorized TestFlight/App Store build and a `production` row. Never copy a token between environments.

## Cloudflare provisioning and secret checklist

Wrangler environment secrets are independent. Create resources first, while all flags remain false:

```bash
pnpm --filter @food-tracker/notifications exec wrangler queues create list-to-ladle-notification-delivery-sandbox
pnpm --filter @food-tracker/notifications exec wrangler queues create list-to-ladle-notification-dlq-sandbox
pnpm --filter @food-tracker/notifications exec wrangler queues create list-to-ladle-notification-delivery-production
pnpm --filter @food-tracker/notifications exec wrangler queues create list-to-ladle-notification-dlq-production

pnpm --filter @food-tracker/notifications exec wrangler secret put APNS_KEY_ID
pnpm --filter @food-tracker/notifications exec wrangler secret put APNS_TEAM_ID
pnpm --filter @food-tracker/notifications exec wrangler secret put APNS_PRIVATE_KEY
pnpm --filter @food-tracker/notifications exec wrangler secret put PUSH_TEST_TOKEN

pnpm --filter @food-tracker/notifications exec wrangler secret put APNS_KEY_ID --env production
pnpm --filter @food-tracker/notifications exec wrangler secret put APNS_TEAM_ID --env production
pnpm --filter @food-tracker/notifications exec wrangler secret put APNS_PRIVATE_KEY --env production
```

Paste the full PKCS#8 `.p8` contents for `APNS_PRIVATE_KEY`. Do not configure `PUSH_TEST_TOKEN` in production. Then:

1. Review and apply the shared migration lineage through `0039` to the intended production D1 database:

   ```bash
   pnpm --filter @food-tracker/web db:migrate:remote
   ```

2. Deploy the sandbox and production Workers with all three flags still false.

   ```bash
   pnpm --filter @food-tracker/notifications exec wrangler deploy --env=""
   pnpm --filter @food-tracker/notifications exec wrangler deploy --env production
   ```

3. Confirm `/health` reports the expected environment configuration and `eventGenerationReady: false`.
4. Implement and test explicit per-team preference mutation, deterministic delivery/outbox creation, matching queue enqueue/repair, and topic generation.
5. Run removed-member, preference-revocation, token-rotation, duplicate-message, expired-lease, APNs `410`, APNs `429`/`5xx`, and DLQ replay drills.
6. Enable `PUSH_TEST_ENABLED` only in sandbox for a persisted, opted-in test delivery. Disable it after verification.
7. Enable `PushNotificationsAvailable`, `NOTIFICATIONS_ENABLED`, and `PUSH_ENABLED` only after the producer/generation gate is complete. Production flags must remain false until a production-signed device and production APNs credentials pass the same checks.

Cloudflare secrets belong in Worker secrets, not `wrangler.jsonc` or source. See the [Cloudflare Workers secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/).
