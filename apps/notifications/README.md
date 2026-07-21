# List To Ladle notifications Worker

This Worker is the first, intentionally disabled slice of the notification-system RFC. It is deployed at `https://list-to-ladle-notifications.zacjones93.workers.dev` with the existing shared D1 binding, a delivery Queue and DLQ, and a 15-minute UTC Cron Trigger. No notification D1 migration has been created or applied.

The current safety state is deliberate:

- `NOTIFICATIONS_ENABLED` and `SMS_ENABLED` are `false`.
- The Telnyx adapter has a tested send path but is not called by the Queue consumer until membership, preference, verified-contact, consent, opt-out, idempotency, and delivery-state checks exist in D1.
- The Telnyx webhook endpoint verifies Ed25519 signatures and rejects stale requests, but returns `503` until callbacks can be persisted idempotently.
- The Telnyx Messaging Profile must not point at the Worker until the webhook can persist callbacks durably and return a fast `2xx`.
- `TELNYX_API_KEY` and `TELNYX_PUBLIC_KEY` are Worker secrets. Never add them to `wrangler.jsonc` or source.

## Local verification

```bash
pnpm --filter @food-tracker/notifications check
pnpm --filter @food-tracker/notifications deploy:dry-run
```

The live Telnyx sender is `+1 208-218-0252`, assigned to the `List To Ladle - Household Notifications` Messaging Profile. Smart encoding, mobile-only delivery, US-only destinations, and a `$0.50` daily profile spend limit are enabled.

## Launch gates

Before enabling either kill switch:

1. Review and generate the RFC data-model migration from `apps/web/src/db/schema.ts`; do not hand-write or apply SQL.
2. Implement verified contact and express-consent evidence, plus authoritative STOP/START/HELP handling.
3. Recheck team membership and per-team preferences immediately before every external send.
4. Add durable webhook and delivery-state persistence, then verify duplicate and out-of-order callbacks against the deployed endpoint.
5. Configure the Telnyx primary/failover webhook URLs only after the endpoint returns a fast `2xx` following durable processing.
6. Complete and assign an approved 10DLC brand/campaign before sending to off-net US recipients.
7. Fund the Telnyx account and obtain an explicitly consented test recipient before enabling either kill switch or sending a live SMS.
