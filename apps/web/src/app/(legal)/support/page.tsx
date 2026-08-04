import type { Metadata } from "next";
import Link from "next/link";

import { LegalConfigurationNotice } from "@/components/legal-configuration-notice";
import { getEmailHref, getLegalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with List To Ladle accounts, teams, sync, AI, notifications, and billing.",
};

export default function SupportPage() {
  const legal = getLegalConfig();
  const supportEmailHref = getEmailHref(legal.supportEmail);
  const privacyEmailHref = getEmailHref(legal.privacyEmail);

  return (
    <>
      <h1 className="mb-4 text-4xl font-bold text-foreground">List To Ladle Support</h1>
      <p className="mb-8 text-muted-foreground">
        Help with accounts, shared kitchens, sync, AI, notifications, subscriptions, privacy, and
        deletion.
      </p>

      <LegalConfigurationNotice missingKeys={legal.missingKeys} />

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Contact support</h2>
        <p className="text-muted-foreground">
          Email:{" "}
          {supportEmailHref ? (
            <a className="underline" href={`${supportEmailHref}?subject=List%20To%20Ladle%20Support`}>
              {legal.supportEmail}
            </a>
          ) : legal.supportEmail}
        </p>
        <p className="mt-3 text-muted-foreground">
          Include the email on your account, the device and browser you use, what you expected, what
          happened, and any error message. Do not send passwords, full payment-card numbers, Gemini
          API keys, or APNs device tokens.
        </p>
      </section>

      <section className="mb-8" id="account-deletion">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Account and data deletion</h2>
        <p className="text-muted-foreground">
          You can initiate permanent account deletion on the website under Settings, then Account,
          or in the iOS app under More, Account and sessions, then Delete account. The deletion
          preview identifies sole-member kitchens that will be deleted, shared kitchens that will
          remain, and any shared kitchen whose ownership must be transferred first. Confirm with
          your current password and the word DELETE. Deleting the iOS app, signing out, or leaving a
          team does not delete the account.
        </p>
        <p className="mt-3 text-muted-foreground">
          For deletion help or a separate privacy-rights request, contact:{" "}
          {privacyEmailHref ? (
            <a className="underline" href={`${privacyEmailHref}?subject=Delete%20my%20List%20To%20Ladle%20account`}>
              {legal.privacyEmail}
            </a>
          ) : legal.privacyEmail}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Common questions</h2>
        <div className="space-y-6 text-muted-foreground">
          <div>
            <h3 className="font-semibold text-foreground">Why are my changes waiting to sync?</h3>
            <p className="mt-1">
              Keep the app open with a network connection. Confirm that the correct team is selected
              under More and that your role allows the change. Do not sign out or reinstall while
              local changes are still queued unless support asks you to.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Who can see a shared recipe or list?</h3>
            <p className="mt-1">
              Active members of the selected team can access team content according to their role.
              Team owners and administrators manage members and permissions in Settings on the web.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">How do I delete an AI conversation?</h3>
            <p className="mt-1">
              Open the AI assistant conversation list and use the conversation delete control. Team
              usage records may remain for security, limits, accounting, and operational integrity.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">How do I manage notifications?</h3>
            <p className="mt-1">
              In the iOS app, open More, then Push notifications. You can disable the registration
              for the current account there or revoke permission in iOS Settings.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">How do I manage or cancel a subscription?</h3>
            <p className="mt-1">
              A team owner or administrator can manage a web subscription through the Stripe billing
              portal. App Store subscriptions can be managed from the iOS app or Apple subscription
              settings. Account deletion does not cancel an App Store subscription; cancel it with
              Apple separately to prevent future renewal.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Is AI advice guaranteed to be correct?</h3>
            <p className="mt-1">
              No. Check recipes, ingredient quantities, cooking temperatures, allergies, dietary
              needs, and assistant-proposed changes yourself. The assistant is not medical,
              nutritional, or food-safety advice.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Policies</h2>
        <p className="text-muted-foreground">
          Read the <Link className="underline" href="/privacy">Privacy Policy</Link> and{" "}
          <Link className="underline" href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </>
  );
}
