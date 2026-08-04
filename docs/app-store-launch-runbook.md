# List To Ladle App Store launch runbook

Last verified: August 4, 2026

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
- Replacement build number in source: `4`.
- Minimum iOS: 18.0.
- iPhone only.
- Category: Food & Drink.
- App Store price: Free.
- Availability: all selected storefronts.
- Manual release.
- Automatic signing for WODSMITH LLC (`TV6G82BJ4U`).
- App icon, privacy manifest, privacy labels, age rating, legal URLs, review contact, and review credentials.
- Production mobile API, legal pages, account deletion, Stripe entitlement sync, and AI backend.
- Prepared review workspace with current recipe, weekly-plan, grocery-list, and complimentary AI data.
- Five current 1320 × 2868 opaque JPEG screenshots captured from signed Release build 4 on iPhone 17 Pro Max.
- StoreKit purchase UI and StoreKit code are excluded from the app target.
- Release binary contains no purchase or Stripe call-to-action strings and does not link StoreKit.
- Simulator Release build uses production and successfully syncs the review workspace.
- 32 iOS tests pass, including three focused account-deletion tests.
- Signed Release build 4 was clean-installed and verified on an iPad Air 11-inch (M3) simulator with iPadOS 26.2, the nearest locally available runtime to the reviewer’s iPadOS 26.6.
- Archive `1.0 (4)` uploaded successfully and finished processing.
- Build 4 is attached and saved on App Store version 1.0; build 3 is no longer attached.
- Stripe-neutral description and App Review notes addressing submission `61be2865-ffc0-4004-9e76-1cfef74fc49c` are saved.
- `https://listtoladle.com/support` returns HTTP 200 and renders on iPad Safari with support contact, deletion guidance, FAQs, Privacy Policy, and Terms of Service.
- Five current build 4 screenshots are uploaded in the iPhone 6.9-inch slot.
- App privacy disclosures are published.

Resubmission work still required:

- Permanently remove the three rejected 6.5-inch screenshots after owner confirmation.
- Add version 1.0 with build 4 for review, verify that no In-App Purchase or subscription is attached, and submit.

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

RESOLUTION FOR SUBMISSION 61be2865-ffc0-4004-9e76-1cfef74fc49c — BUILD 4

Guideline 2.1(a): Build 4 fixes the account-deletion error. We clean-installed the signed Release build on an iPad Air 11-inch (M3) simulator using iPadOS 26.2, the nearest locally available runtime to the review device's iPadOS 26.6, and verified More > Account and sessions > Delete account through the final confirmation. The production deletion preview loads, password reauthentication and DELETE validation work, and no error appears. Three focused deletion tests also pass. The app is iPhone-only and runs in iPhone compatibility mode on iPad.

Guideline 1.5: https://listtoladle.com/support is live and returns HTTP 200 for canonical, HEAD, and iPad Safari-style requests. It contains support contact information, account-deletion instructions, FAQs, Privacy Policy, and Terms of Service.

Guideline 2.3.3: Five fresh native 6.9-inch screenshots captured from signed Release build 4 on iPhone 17 Pro Max were uploaded. They show the current Plan overview, week meals, groceries, Recipes library, and recipe detail UI.

Business model: The iPhone app is free and acts as a stand-alone companion to the List To Ladle web service under App Review Guideline 3.1.3(f). It does not offer purchases, prices, Apple In-App Purchases, external checkout links, or calls to action to purchase outside the app. It only reads the active team's existing server-side entitlements after sign-in.

Account deletion path: More > Account and sessions > Delete account. The flow shows the deletion impact, requires password reauthentication and the word DELETE, preserves shared-team content, and removes personal/local data after server confirmation.

The AI assistant is available inside the prepared sample workspace and sends authorized prompt/context data through our backend to Google Gemini.

```

The review username and password are saved in App Store Connect and intentionally not duplicated here.

## Screenshot plan

Five current screenshots are uploaded in the iPhone 6.9-inch slot. Apple allows one to ten screenshots and can scale the highest-resolution accepted set.

1. Plan overview — `build4-01-plan-overview-6.9.jpg`.
2. Week meals — `build4-02-week-meals-6.9.jpg`.
3. Grocery list — `build4-03-groceries-6.9.jpg`.
4. Recipe library — `build4-04-recipes-library-6.9.jpg`.
5. Recipe detail — `build4-05-recipe-detail-6.9.jpg`.

Do not show real personal data, a locked Assistant tab, prices, Stripe, debug controls, localhost URLs, or unfinished notifications.

## Completed Xcode and upload steps

Build 4 has already been archived, exported, uploaded, processed, and attached. No Xcode action is required for this submission unless the binary changes.

## Owner steps in App Store Connect

1. Confirm the three rejected 6.5-inch screenshots have been removed and the five current 6.9-inch screenshots remain.
2. Return to iOS App 1.0 and confirm build 4, Manual release, the saved review credentials, and the rejection-resolution notes.
3. Click Add for Review.
4. Review the submission summary carefully: the app version should be present and no In-App Purchases or subscriptions should be attached.
5. Click Submit to App Review.

Accepting a new legal agreement is an owner action. The owner explicitly authorized this build 4 resubmission after the submission contents are verified.

## Final submission gate

Do not submit if any item is false:

- Build 4 is selected.
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
