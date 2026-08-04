# Stripe billing setup

List To Ladle uses Stripe Checkout and the Stripe Customer Portal for team subscriptions. Each successful subscription gets an immutable entitlement snapshot, so later plan changes do not silently alter features for existing customers.

## Product and price

1. In each Stripe environment (test and live), create a recurring product for List To Ladle Pro.
2. Create the recurring price with the intended amount, currency, and billing interval.
3. Copy the price ID into `STRIPE_PRO_PRICE_ID` for that environment.
4. In Stripe Checkout settings, enable the option that limits a customer to one active subscription.
5. Configure the Customer Portal to allow payment-method updates and subscription cancellation.

The application intentionally does not hard-code price copy. The billing page reads the configured Stripe Price so test and production pricing stay aligned with Stripe.

## Dedicated sandbox

The Stripe CLI profile `list-to-ladle-sandbox` points at the isolated sandbox account `acct_1TvmzTLJY2rn97Wh`. Claim it before its temporary access expires, then log that profile in again to replace the temporary credentials with permanent sandbox credentials.

The sandbox catalog is configured with:

- Product: `prod_UvfHGVd78rffCG` (`List To Ladle Pro`)
- Monthly test Price: `price_1TvnxdLJY2rn97WhCYu3A2Q6` (`$9.00 USD`)
- Customer Portal: `bpc_1TvnxtLJY2rn97WhBUA9L7NM`

These IDs are test-only and must never be used for the live deployment. For sandbox development, set `STRIPE_PRO_PRICE_ID` to the test Price and read the restricted sandbox API credential from the CLI profile rather than committing it to an environment file.

## Worker configuration

`APP_URL` is a non-secret Worker variable in `apps/web/wrangler.jsonc`. Add these values as Cloudflare Worker secrets in both preview and production:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`

For local development, copy the corresponding test values into `apps/web/.dev.vars` or `apps/web/.env.local`. Never commit those files.

## Webhook

Create a Stripe webhook endpoint at:

```text
https://listtoladle.com/api/stripe/webhook
```

Subscribe it to these event families:

- Checkout Session completed
- Customer Subscription created, updated, deleted, paused, and resumed
- Invoice paid, payment failed, payment action required, and marked uncollectible

For local testing, forward Stripe CLI events to the same route:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the signing secret printed by `stripe listen` as the local `STRIPE_WEBHOOK_SECRET`.

## Entitlement versions

The current offers live in `apps/web/src/lib/entitlements/features.ts`.

- Free v1: four lifetime week creations per team; no AI assistant or push notifications.
- Pro v1: unlimited week creations; AI assistant and push notifications enabled.

To change the paid offer for future purchases, increment `CURRENT_PAID_PLAN.version` and change its features. Do not edit stored snapshots. Existing subscriptions continue using the snapshot created for their Stripe subscription.

## iOS distribution rule

The iOS app is a free companion to the web service. Existing Stripe subscribers retain their shared team entitlement after signing in, but the iOS target contains no StoreKit, Stripe Checkout, prices, purchase UI, external billing-management link, or call to action to buy outside the app.

Review this behavior against the App Store Review Guidelines before each release because storefront rules and available entitlements can change.

## Launch checklist

- Apply database migration `0035_add-team-entitlements.sql`.
- Configure test secrets, price, Checkout, Customer Portal, and webhook.
- Complete a test Checkout and confirm the success page activates Pro immediately.
- Send webhook retry and out-of-order tests; confirm state is rebuilt from Stripe.
- Cancel through the portal and confirm access follows the Stripe status and paid-through period.
- Repeat the configuration with live-mode IDs and secrets.
- Update the Terms and Privacy pages with the final price, renewal, cancellation, trial, and Stripe-processing terms before launch.
