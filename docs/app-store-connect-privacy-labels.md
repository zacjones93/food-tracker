# List To Ladle App Store privacy inventory

Audited: July 22, 2026

This is an implementation inventory for App Store Connect, not legal advice or confirmation of legal review. Re-audit it whenever the iOS app, backend, service providers, subscription model, or logging changes. App Store Connect answers must describe the submitted app version and the production configuration.

## Audited product flows

- iOS creates password accounts with first name, last name, email, and password, then restores a server session.
- The app syncs team recipes, recipe-book references, meal plans, scheduled recipes, grocery items, and grocery templates. It keeps a file-protected offline workspace on the device.
- Team members share workspace content under role-based permissions.
- AI prompts, conversation history, selected recipe or week context, assistant results, run metadata, and token usage pass through the List To Ladle backend. Prompt and resolved context are sent to Google Gemini.
- Stripe Checkout and the Stripe billing portal run on the website. The backend stores customer/subscription identifiers, plan and period state, cancellation state, card brand, and last four digits. iOS receives the team entitlement/subscription status and may link United States storefront users to the website.
- Optional notifications create an app installation UUID in `UserDefaults`, register an APNs token, associate the registration with the signed-in user, and send alerts through APNs.
- Sessions store the account, active team, authentication type, IP address, Cloudflare-derived city/country/continent, user agent, and timestamps in Cloudflare KV for up to 30 days.
- Transactional email may use Resend or Brevo. Google OAuth may be enabled in production.

## Privacy manifest

`apps/mobile/FoodTracker/Resources/PrivacyInfo.xcprivacy` is included in the iOS application target.

### Required-reason API

| API category | Reason | Source evidence | Result |
| --- | --- | --- | --- |
| User defaults | `CA92.1` | `PushInstallation.identifier` reads and writes `UserDefaults.standard` to persist the app-scoped push installation UUID. | Declared |

No other required-reason API use was found in first-party Swift source. The file APIs used for the offline workspace create, read, atomically write, and delete app-container files; the audited source does not read file timestamps, disk-space APIs, system boot time, or active keyboard state. Re-run an Xcode privacy report on the release archive because compiled Apple or future third-party frameworks can add declarations not visible in first-party source.

### Collected-data declarations

Every declared type is linked to the user, used for app functionality (with personalization also selected where noted), and not used for tracking.

| Manifest data type | App Store Connect category | Purpose | Evidence |
| --- | --- | --- | --- |
| Name | Contact Info → Name | App Functionality; Product Personalization | Account profile, team naming, UI personalization, Stripe customer name update |
| Email Address | Contact Info → Email Address | App Functionality | Authentication, team invitations, transactional email, Stripe customer |
| Coarse Location | Location → Coarse Location | App Functionality | Cloudflare city/country/continent retained in the linked 30-day session |
| Payment Info | Financial Info → Payment Info | App Functionality | Stripe handles full billing details; List To Ladle can access/store card brand and last four digits |
| Customer Support | User Content → Customer Support | App Functionality | Support and privacy correspondence |
| Other User Content | User Content → Other User Content | App Functionality; Product Personalization | Recipes, meal plans, grocery lists/templates, notes, links, AI prompts and messages |
| User ID | Identifiers → User ID | App Functionality | User, team, session, chat, sync, AI usage, and subscription association |
| Device ID | Identifiers → Device ID | App Functionality | App-scoped installation UUID and APNs device token linked to the user |
| Purchase History | Purchases → Purchase History | App Functionality | Team subscription status, plan, periods, cancellation state, and entitlement access |
| Product Interaction | Usage Data → Product Interaction | App Functionality | AI run/usage records, tool execution summaries, sync mutation ledger, and push last-seen state |

## App Store Connect selections

For each row above, select:

- Data used for tracking: **No**
- Data linked to the user's identity: **Yes**
- Purpose: **App Functionality**
- Additional purpose for Name and Other User Content: **Product Personalization**

At the top level:

- Does the app or its third-party partners collect data? **Yes**
- Is any collected data used for tracking? **No**, based on the audited implementation
- Privacy Policy URL: `https://listtoladle.com/privacy`
- Privacy Choices URL: `https://listtoladle.com/support#account-deletion` (publish only after the real production identity and contacts are configured)
- Support URL: `https://listtoladle.com/support`

## Types not found in the submitted implementation

- Precise location
- Phone number or physical address requested by the app itself (Stripe may request a billing address during hosted checkout; Payment Info is declared)
- Health, fitness, contacts, photos, video, audio, or environment scanning
- Browsing history or a separately retained search-history feature
- Advertising data, third-party advertising, or cross-company tracking
- Crash or performance telemetry SDKs

If Cloudflare log retention, Apple diagnostics, Google settings, or another production provider captures additional linked diagnostics, update both this list and App Store Connect.

## Third-party processing inventory

| Provider | Data | Function |
| --- | --- | --- |
| Cloudflare | Account/session identifiers, IP-derived coarse location, user agent, service content, request and operational data | Workers, D1, KV, networking, rate limiting, security |
| Google Gemini | AI prompts, selected team context, conversation inputs, generated output | AI assistant generation |
| Google OAuth (if enabled) | OAuth identifiers and account email/profile data | Optional sign-in |
| Stripe | Customer identity, billing details, payment method, subscription and checkout data | Website subscription payment and management |
| Apple App Store | App account token, product and transaction identifiers, subscription status and periods | StoreKit purchase verification and entitlement management |
| Apple APNs | Device token, app topic/environment, notification payload | Optional push delivery |
| Resend or Brevo | Recipient name/email and transactional message content | Verification, reset, and invitation email |

Production owners must confirm provider contracts, regions, log retention, and Google AI data-use settings; the repository does not prove those account-level configurations.

## Submission blockers and owner decisions

1. **Configure real public identity and contacts.** Set `LEGAL_ENTITY_NAME`, `LEGAL_BUSINESS_ADDRESS`, `LEGAL_GOVERNING_LAW`, `PRIVACY_CONTACT_EMAIL`, and `SUPPORT_CONTACT_EMAIL` in production. The pages deliberately show a launch warning instead of inventing these values.
2. **Verify account deletion end to end.** The web and iOS apps now initiate authenticated deletion, remove personal D1/KV/assistant/APNs data, delete sole-member teams, retain shared-team content, and require ownership transfer where necessary. Before submission, test success, failure recovery, shared-team ownership, Stripe cleanup, and local iOS file removal against a production-shaped environment. Account deletion does not cancel an App Store subscription; the UI directs the user to Apple subscription settings.
3. **Configure and verify StoreKit.** Create the real subscription group and products in App Store Connect, configure the bundle/app/product identifiers and Apple root certificates, add the App Store Server Notifications V2 production and sandbox URLs, and validate purchase, restore, renewal, refund, grace-period, and account-deletion behavior in Sandbox and TestFlight. Do not rely on these terms pages as payment-rule approval.
4. **Obtain legal review.** The privacy policy and terms are product-specific operational drafts. A qualified reviewer should confirm the operator identity, address, governing law, minimum age, liability cap, refund language, retention statements, international-transfer language, and jurisdictions where the app will launch.
5. **Archive verification.** Build the release archive, generate Xcode's privacy report, verify the manifest is present in the built `.app`, and reconcile any SDK manifests before upload.

## Apple references

- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Describing use of required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [TN3183: Adding required-reason API entries](https://developer.apple.com/documentation/technotes/tn3183-adding-required-reason-api-entries-to-your-privacy-manifest)
- [Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
