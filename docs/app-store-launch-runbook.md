# List To Ladle App Store launch runbook

Last verified: July 22, 2026

## Final business-model decision

The iPhone app is a **free companion app**. Apple does not sell the app or a List To Ladle subscription.

- App Store price: Free.
- Billing provider: Stripe on the List To Ladle website.
- The iPhone app reads the signed-in team's existing server entitlements.
- The iPhone app contains no checkout, pricing, purchase, restore-purchase, billing-management link, or call to action to buy outside the app.
- Existing Stripe-entitled teams receive the same paid features on web and iPhone.
- App Review receives a prepared account with complimentary non-billing AI access.
- Workspaces without assistant access do not see the Assistant tab, a locked feature, a plan label, or an upgrade prompt.

This submission is intended to fit App Review Guideline 3.1.3(f), which permits a free stand-alone companion to a paid web tool when there is no purchase or external-purchase call to action in the app. Approval is always Apple's decision. Recheck the current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) before each release.

The Paid Apps Agreement, Apple banking, and Apple tax setup are not required for this free app with no In-App Purchases. Apple says Developer Program membership covers distribution of free apps; the Paid Apps Agreement is required to sell apps or offer In-App Purchases. See [Sign and update agreements](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements).

## Current status

Already complete:

- App Store Connect app: `List To Ladle`.
- Apple app ID: `6793734640`.
- Bundle ID: `com.wodsmith.listtoladle`.
- SKU: `list-to-ladle-ios-1`.
- Version: `1.0`.
- Replacement build number in source: `3`.
- Minimum iOS: 18.0.
- iPhone only.
- Category: Food & Drink.
- App Store price: Free.
- Availability: all selected storefronts.
- Manual release.
- Automatic signing for WODSMITH LLC (`TV6G82BJ4U`).
- App icon, privacy manifest, privacy labels, age rating, legal URLs, review contact, and review credentials.
- Production mobile API, legal pages, account deletion, Stripe entitlement sync, and AI backend.
- Prepared review workspace with three recipes, a current week, ten grocery items, and complimentary AI access.
- Three accepted 1242 × 2688 iPhone screenshots: recipe library, weekly plan, and recipe detail.
- StoreKit purchase UI and StoreKit code are excluded from the app target.
- Release binary contains no purchase or Stripe call-to-action strings and does not link StoreKit.
- Simulator Release build uses production and successfully syncs the review workspace.
- 32 iOS tests pass.
- Archive `1.0 (3)` uploaded successfully and finished processing.
- Build 3 is attached and saved on App Store version 1.0; build 2 is no longer attached.
- Stripe-neutral description and free-companion App Review notes are saved.
- App privacy disclosures are published.

Owner-only work still required:

- Complete the Content Rights declaration.
- Complete Digital Services Act trader verification.
- Optionally delete the empty App Store Connect subscription group `List To Ladle Pro` (group ID `22257862`). It contains no products and is not attached to the app version, so leaving it empty does not create an Apple purchase.
- Add the version for review after the two declarations are complete, verify that no In-App Purchase or subscription is attached, and submit.

## App Store copy

Subtitle:

```text
Plan meals. Shop smarter.
```

Promotional text:

```text
Turn recipes into a practical weekly plan and grocery list, with shared household workspaces and an optional AI cooking assistant.
```

Keywords:

```text
meal planner,recipes,grocery list,cooking,weekly menu,food,shopping,kitchen
```

Description:

```text
List To Ladle keeps recipes, weekly meal plans, and grocery shopping in one organized workspace.

SAVE AND ORGANIZE RECIPES
Build a useful recipe library with ingredients, instructions, tags, notes, and source links.

PLAN THE WEEK
Schedule meals on the days that work for you and keep preparation recipes connected to the meals they support.

BUILD YOUR GROCERY LIST
Turn plans and recipes into an editable shopping list that remains useful while you are on the move.

SHARE A HOUSEHOLD WORKSPACE
Invite other people to the same team so recipes and plans stay coordinated.

GET OPTIONAL AI HELP
Use the assistant to find recipes, understand your schedule, and help with planning inside your authorized workspace.

Privacy Policy: https://listtoladle.com/privacy
Terms of Use: https://listtoladle.com/terms
Support: https://listtoladle.com/support
```

## App Review notes

```text
List To Ladle is an iPhone meal-planning app with account-based recipe, schedule, grocery-list, and shared-team features.

Use the review credentials below to access the prepared sample workspace. The review team has complimentary non-billing access to all submitted features, including the AI assistant.

Business model: The iPhone app is free and acts as a stand-alone companion to the List To Ladle web service under App Review Guideline 3.1.3(f). It does not offer purchases, prices, Apple In-App Purchases, external checkout links, or calls to action to purchase outside the app. It only reads the active team's existing server-side entitlements after sign-in.

Account deletion: More > Account and sessions > Delete account. The flow shows the deletion impact, requires password reauthentication and the word DELETE, preserves shared-team content, and removes personal/local data after server confirmation.

The AI assistant is available inside the prepared sample workspace and sends authorized prompt/context data through our backend to Google Gemini.

Push-notification settings are intentionally unavailable in this version because push delivery is not part of the v1 feature set.
```

The review username and password are saved in App Store Connect and intentionally not duplicated here.

## Screenshot plan

Three clean screens are already uploaded and accepted. Apple allows one to ten screenshots and can scale the highest-resolution accepted set.

1. Weekly schedule — “Plan the week in one place”.
2. Recipe library — “Keep every recipe organized”.
3. Recipe detail — “Ingredients and instructions at hand”.

Optional future additions:

4. Grocery list — “Shop from one practical list”.
5. AI assistant or shared team — “Plan together with helpful context”.

Do not show real personal data, a locked Assistant tab, prices, Stripe, debug controls, localhost URLs, or unfinished notifications.

## Completed Xcode and upload steps

Build 3 has already been archived, exported, uploaded, processed, and attached. No Xcode action is required for this submission unless the binary changes.

## Owner steps in App Store Connect

1. Open Apps > List To Ladle > App Information.
2. Under Content Rights, answer whether the app contains, shows, or accesses third-party content. Choose the legally accurate answer and click Done.
3. Under Digital Services Act, click Set Up and complete WODSMITH LLC trader verification.
4. Return to iOS App 1.0 and confirm build 3, three screenshots, Manual release, and the saved review credentials.
5. Optionally delete the empty `List To Ladle Pro` subscription group. Do not create products.
6. Click Add for Review.
7. Review the submission summary carefully: the app version should be present and no In-App Purchases or subscriptions should be attached.
8. Click Submit to App Review.

Accepting a legal agreement and the final submission are owner actions. Codex can navigate to the relevant screen and verify the fields, but the owner should perform those confirmations.

## Final submission gate

Do not submit if any item is false:

- Build 3 is selected.
- The app is Free.
- No In-App Purchase or subscription is attached.
- No purchase, price, external checkout, or billing-management link is reachable in iOS.
- The production review account signs in from a fresh install.
- Recipes, schedule, grocery list, and AI assistant load for the review account.
- Account deletion works.
- `/privacy`, `/terms`, and `/support` return HTTP 200.
- Screenshots reflect the submitted build.
- App Review notes describe the free-companion business model.
- Privacy answers match the final build.

## After approval

Because release is manual:

1. Recheck production health.
2. Confirm support monitoring is active.
3. Click Release This Version.
4. Allow time for storefront propagation; approval does not make an app instantly searchable everywhere.
