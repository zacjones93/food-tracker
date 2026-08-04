import type { Metadata } from "next";
import Link from "next/link";

import { LegalConfigurationNotice } from "@/components/legal-configuration-notice";
import {
  getEmailHref,
  getLegalConfig,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How List To Ladle collects, uses, shares, retains, and deletes information.",
};

export default function PrivacyPage() {
  const legal = getLegalConfig();
  const privacyEmailHref = getEmailHref(legal.privacyEmail);

  return (
    <>
      <h1 className="mb-4 text-4xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mb-8 text-muted-foreground">Effective and last updated: {LEGAL_EFFECTIVE_DATE}</p>

      <LegalConfigurationNotice missingKeys={legal.missingKeys} />

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">1. Who operates List To Ladle</h2>
        <p className="text-muted-foreground">
          List To Ladle is operated by {legal.operatorName} (&quot;List To Ladle,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;). This policy applies to the List To Ladle website, iOS app,
          and related services.
        </p>
        <p className="mt-3 text-muted-foreground">Operator address: {legal.businessAddress}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">2. Information we collect</h2>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            <strong>Account and team information:</strong> name, email address, password hash,
            account and team identifiers, team roles, invitations, profile details, and sign-in
            method.
          </li>
          <li>
            <strong>Food-planning content:</strong> recipes, ingredients, instructions, recipe-book
            references, meal plans, grocery lists and templates, dates, tags, links, and other notes
            you choose to save.
          </li>
          <li>
            <strong>AI assistant content and usage:</strong> prompts, assistant messages, attached
            recipe or meal-plan context, conversation titles, tool activity, token usage, model,
            completion status, and estimated processing cost.
          </li>
          <li>
            <strong>Subscription and payment records:</strong> Stripe customer and subscription
            identifiers, plan, subscription status and period, cancellation state, and limited
            payment-method details such as card brand and last four digits. Stripe receives the full
            payment and billing details; List To Ladle does not store full card numbers.
          </li>
          <li>
            <strong>Device, notification, and session information:</strong> account and session IDs,
            IP address, approximate city/country/continent derived by Cloudflare, user agent,
            authentication type, iOS installation identifier, APNs device token, notification
            environment and status, and session timestamps.
          </li>
          <li>
            <strong>Support information:</strong> the contents of requests you send us and the
            contact information needed to respond.
          </li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          The iOS app also stores an offline copy of your active team workspace on your device using
          iOS file protection. That local copy is not a separate collection by us, but it may remain
          on the device after sign-out so unsynced changes are not lost. Removing the app removes its
          local container.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">3. How we use information</h2>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Authenticate accounts, maintain sessions, and protect the service from abuse.</li>
          <li>Sync recipes, meal plans, grocery lists, and other changes across devices.</li>
          <li>Provide team sharing, invitations, roles, and permissions.</li>
          <li>Generate requested AI responses and apply user-approved assistant changes.</li>
          <li>Provide optional reminders through Apple Push Notification service.</li>
          <li>Administer subscriptions, entitlements, billing support, and transaction records.</li>
          <li>Respond to support, privacy, security, and legal requests.</li>
          <li>Operate, troubleshoot, secure, and improve service reliability.</li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          We do not sell personal information, serve third-party advertising, or use information to
          track you across other companies&apos; apps or websites.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">4. Teams and shared content</h2>
        <p className="text-muted-foreground">
          Content saved to a team is available to team members according to their roles and may be
          edited or deleted by members with permission. Team owners and administrators control
          membership and billing. If you leave a team or delete your account, team-owned recipes,
          lists, plans, and other shared content may remain available to that team because the data
          belongs to the shared workspace rather than an individual profile.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">5. AI and Google Gemini</h2>
        <p className="text-muted-foreground">
          When you use the AI assistant, List To Ladle sends your prompt and the relevant team
          context selected for the request to Google&apos;s Gemini API. Google processes that data to
          return a response under the terms and data-handling settings of our configured Google AI
          service account. Assistant conversations and operational records are also stored by List
          To Ladle so you can revisit conversations, resume runs, enforce team limits, and audit
          user-approved changes. Do not submit information you do not want processed by the AI
          service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">6. Service providers</h2>
        <p className="text-muted-foreground">We use providers to operate specific parts of the service:</p>
        <ul className="mt-2 list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Cloudflare for application hosting, database, key-value storage, security, and networking.</li>
          <li>Google Gemini for AI generation, and Google OAuth if you choose Google sign-in.</li>
          <li>Stripe for subscription checkout, payment processing, and the billing portal.</li>
          <li>Apple Push Notification service for optional iOS notifications.</li>
          <li>Resend or Brevo, depending on deployment configuration, for transactional email.</li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          These providers process information only for the services they supply, subject to their
          agreements and applicable law. We may also disclose information when required by law, to
          protect rights and safety, or as part of a business transfer with appropriate safeguards.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">7. Retention and deletion</h2>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Active sign-in sessions expire after 30 days unless ended sooner.</li>
          <li>
            Account, team, recipe, list, meal-plan, AI conversation, and subscription records are
            generally kept while needed to provide the service or until they are deleted.
          </li>
          <li>
            Disabled push registrations and operational records may be kept to enforce preferences,
            prevent abuse, resolve disputes, and satisfy legal or accounting duties.
          </li>
          <li>
            Provider-managed backups and logs may retain limited copies until they are overwritten
            under the provider&apos;s normal retention cycle.
          </li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          You can delete individual recipes, plans, grocery items, and AI chats where the product
          offers that control. You can initiate account and associated personal-data deletion from
          Settings, then Account on the website, or from More, Account and sessions, then Delete
          account in the iOS app. Sole-member teams are deleted; shared-team content remains for
          other members, and a sole active owner must transfer ownership first. Removing the iOS app
          alone does not delete the server account. Account deletion does not cancel an App Store
          subscription, which must be managed separately through Apple.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">8. Your choices and rights</h2>
        <p className="text-muted-foreground">
          You may update profile information, manage team access, delete supported content, disable
          notifications in the app and iOS Settings, cancel a subscription through the Stripe
          billing portal or Apple subscription settings, or ask us to access, correct, export,
          restrict, or delete personal
          information. Available legal rights depend on where you live. We may need to verify your
          identity before completing a request.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">9. Security and international processing</h2>
        <p className="text-muted-foreground">
          We use administrative, technical, and organizational safeguards designed to protect
          information, but no system is completely secure. Our providers may process information in
          countries other than your own, subject to applicable transfer safeguards.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">10. Children</h2>
        <p className="text-muted-foreground">
          List To Ladle is not directed to children under 13, and we do not knowingly collect their
          personal information. Contact us if you believe a child has provided personal information.
          A higher minimum age may apply in some locations.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">11. Changes and contact</h2>
        <p className="text-muted-foreground">
          We may update this policy and will change the date above when we do. Material changes may
          also be communicated in the service or by email when appropriate.
        </p>
        <p className="mt-3 text-muted-foreground">
          Privacy contact:{" "}
          {privacyEmailHref ? (
            <a className="underline" href={privacyEmailHref}>{legal.privacyEmail}</a>
          ) : legal.privacyEmail}
        </p>
        <p className="mt-2 text-muted-foreground">
          General help is available on the <Link className="underline" href="/support">support page</Link>.
        </p>
      </section>
    </>
  );
}
