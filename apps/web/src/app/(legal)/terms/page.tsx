import type { Metadata } from "next";
import Link from "next/link";

import { LegalConfigurationNotice } from "@/components/legal-configuration-notice";
import {
  getEmailHref,
  getLegalConfig,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of List To Ladle accounts, teams, AI, and subscriptions.",
};

export default function TermsPage() {
  const legal = getLegalConfig();
  const supportEmailHref = getEmailHref(legal.supportEmail);

  return (
    <>
      <h1 className="mb-4 text-4xl font-bold text-foreground">Terms of Service</h1>
      <p className="mb-8 text-muted-foreground">Effective and last updated: {LEGAL_EFFECTIVE_DATE}</p>

      <LegalConfigurationNotice missingKeys={legal.missingKeys} />

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">1. Agreement and operator</h2>
        <p className="text-muted-foreground">
          These Terms are an agreement between you and {legal.operatorName}, the operator of List To
          Ladle. By creating an account or using the website, iOS app, or related services, you agree
          to these Terms and the <Link className="underline" href="/privacy">Privacy Policy</Link>.
          If you use List To Ladle for an organization or household, you represent that you have
          authority to accept these Terms for that group.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">2. Eligibility and accounts</h2>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>You must be at least 13 and legally able to enter this agreement.</li>
          <li>Provide accurate registration information and keep it current.</li>
          <li>Keep credentials secure and promptly report suspected unauthorized access.</li>
          <li>You are responsible for activity under your account unless applicable law says otherwise.</li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          You may stop using the service at any time. You can initiate account deletion through the
          website or iOS account settings as described in the Privacy Policy and support page.
          Deleting the app or signing out does not itself cancel a subscription or delete the server
          account, and deleting an account does not cancel an App Store subscription.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">3. Teams and shared workspaces</h2>
        <p className="text-muted-foreground">
          Teams are shared workspaces. Members with permission may view, add, edit, export, or delete
          team recipes, meal plans, grocery lists, templates, and settings. Team owners and
          administrators manage members, roles, AI settings, and billing. You are responsible for
          inviting only people who should have access and for obtaining permission before adding
          another person&apos;s information. Shared content may remain with a team after a member leaves
          or deletes an account.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">4. Your content and recipe sources</h2>
        <p className="text-muted-foreground">
          You retain ownership of content you create. You grant us a limited, worldwide license to
          host, copy, process, transmit, and display that content only as needed to operate, secure,
          and improve List To Ladle. You represent that you have the rights needed to add the content
          and links you submit. Respect recipe authors, publishers, trademarks, copyrights, and any
          source-site terms; do not use List To Ladle to reproduce or distribute content unlawfully.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">5. AI assistant</h2>
        <p className="text-muted-foreground">
          The assistant sends prompts and relevant team context through Cloudflare AI Gateway to
          OpenAI and may return incomplete, inaccurate, or unsuitable results. Review all output and
          every proposed change before relying on it. AI output is not medical, nutritional, allergy,
          food-safety, or other professional advice. You are responsible for ingredient, dietary,
          allergy, storage, preparation, and cooking decisions. Do not submit secrets or sensitive
          personal information that is unnecessary for meal planning.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">6. Subscriptions and Stripe billing</h2>
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            Paid plans are currently purchased and managed on the List To Ladle website through
            Stripe and apply to the selected team.
          </li>
          <li>
            Prices, included features, billing interval, and any trial are shown before checkout.
            Subscriptions renew automatically until canceled.
          </li>
          <li>
            A team billing manager can cancel through the Stripe billing portal. Cancellation
            normally takes effect at the end of the paid period unless checkout or applicable law
            states otherwise.
          </li>
          <li>
            Fees are non-refundable except where required by law or expressly stated at purchase.
            Taxes and currency conversion may apply.
          </li>
        </ul>
        <p className="mt-4 text-muted-foreground">
          Deleting an account does not automatically resolve ownership of a shared team. Before an
          owner leaves or initiates deletion, they may need to transfer team ownership and separately
          manage an active Stripe or App Store subscription.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">7. Acceptable use</h2>
        <p className="text-muted-foreground">You may not:</p>
        <ul className="mt-2 list-disc space-y-2 pl-6 text-muted-foreground">
          <li>Break the law or infringe another person&apos;s rights.</li>
          <li>Access another account or team without authorization.</li>
          <li>Probe, disrupt, overload, scrape, or bypass security or usage limits.</li>
          <li>Upload malware or use the service to send spam, harass, or harm others.</li>
          <li>Reverse engineer the service except where that restriction is prohibited by law.</li>
          <li>Use AI features to generate illegal or harmful material or evade safety controls.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">8. Service changes and termination</h2>
        <p className="text-muted-foreground">
          We may change, suspend, or discontinue features and may impose reasonable limits. We may
          suspend or terminate access for material or repeated violations, security risk, nonpayment,
          or legal necessity. Where practical, we will provide notice and an opportunity to export
          data. Provisions that by their nature should survive termination will survive.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">9. Disclaimers</h2>
        <p className="text-muted-foreground">
          To the maximum extent permitted by law, List To Ladle is provided &quot;as is&quot; and &quot;as
          available.&quot; We disclaim implied warranties, including merchantability, fitness for a
          particular purpose, non-infringement, and uninterrupted or error-free operation. We do not
          warrant third-party content, AI output, recipe accuracy, nutrition, allergy safety, or that
          synced data will never be lost. Some jurisdictions do not allow certain disclaimers, so
          parts of this section may not apply to you.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">10. Limitation of liability</h2>
        <p className="text-muted-foreground">
          To the maximum extent permitted by law, {legal.operatorName} will not be liable for
          indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost
          profits, revenues, goodwill, or data. Our aggregate liability for claims relating to the
          service will not exceed the greater of the amount you paid us during the 12 months before
          the claim or US $100. These limits do not apply where liability cannot legally be limited.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">11. Governing law and disputes</h2>
        <p className="text-muted-foreground">
          These Terms are governed by {legal.governingLaw}, without regard to conflict-of-law rules,
          except that mandatory consumer protections in your home jurisdiction still apply. Before
          filing a claim, contact us and allow 30 days for an informal resolution unless immediate
          action is legally necessary.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">12. General terms</h2>
        <p className="text-muted-foreground">
          These Terms and the Privacy Policy are the entire agreement about the service. If one
          provision is unenforceable, the remainder stays effective. Our failure to enforce a term
          is not a waiver. You may not transfer this agreement without consent; we may transfer it as
          part of a reorganization or sale. We may update these Terms, and material changes will take
          effect after reasonable notice when required.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-foreground">13. Contact</h2>
        <p className="text-muted-foreground">
          Support contact:{" "}
          {supportEmailHref ? (
            <a className="underline" href={supportEmailHref}>{legal.supportEmail}</a>
          ) : legal.supportEmail}
        </p>
        <p className="mt-2 text-muted-foreground">Operator address: {legal.businessAddress}</p>
        <p className="mt-2 text-muted-foreground">
          See the <Link className="underline" href="/support">support page</Link> for account,
          billing, notification, and deletion help.
        </p>
      </section>
    </>
  );
}
