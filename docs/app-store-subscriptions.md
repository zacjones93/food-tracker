# App Store subscription setup (retired)

List To Ladle does not sell subscriptions through Apple.

The iPhone app is distributed for free and acts as a companion to the List To Ladle web service:

- Stripe is the only subscription billing provider.
- The iPhone app reads the signed-in team's existing server entitlements.
- The iPhone target does not compile or link StoreKit.
- The app contains no purchase, price, restore-purchase, external checkout, or billing-management call to action.
- No App Store Connect subscription products, In-App Purchase keys, App Store Server Notifications, or Apple subscription review screenshots are required.

The repository still contains dormant Apple server-integration files and migration history from an abandoned implementation. They are not configured in production and are not reachable from the submitted iOS target. Do not enable or deploy that path without a new product decision and a fresh App Review analysis.

See `docs/app-store-launch-runbook.md` for submission steps and `docs/stripe-billing.md` for the active billing architecture.
