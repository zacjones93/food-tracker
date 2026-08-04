"use server";

import { getOrCreateStripeCustomer } from "@/lib/billing/stripe-sync";
import { getTeamEntitlements } from "@/lib/entitlements";
import { getStripe } from "@/lib/stripe";
import { getSessionFromCookie } from "@/utils/auth";
import { hasPermission } from "@/utils/team-auth";
import { TEAM_PERMISSIONS } from "@/db/schema";
import { headers } from "next/headers";
import { createServerAction, ZSAError } from "zsa";

async function requireBillingManager() {
  const session = await getSessionFromCookie();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
  if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

  const canManage = await hasPermission(
    session.user.id,
    session.activeTeamId,
    TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS,
  );
  if (!canManage) {
    throw new ZSAError("FORBIDDEN", "Only a team owner or admin can manage billing");
  }
  return { session, teamId: session.activeTeamId };
}

async function getApplicationOrigin(): Promise<string> {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  if (process.env.NODE_ENV === "production") {
    throw new ZSAError("INTERNAL_SERVER_ERROR", "APP_URL is not configured");
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new ZSAError("INTERNAL_SERVER_ERROR", "Unable to determine the application URL");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

export const createSubscriptionCheckoutAction = createServerAction()
  .handler(async () => {
    const { session, teamId } = await requireBillingManager();
    const entitlements = await getTeamEntitlements({ teamId });
    if (entitlements.source !== "free") {
      throw new ZSAError(
        "CONFLICT",
        "This team already has a subscription. Manage it with its purchase provider.",
      );
    }
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      throw new ZSAError("INTERNAL_SERVER_ERROR", "STRIPE_PRO_PRICE_ID is not configured");
    }

    const customerId = await getOrCreateStripeCustomer({
      email: session.user.email,
      teamId,
    });
    const origin = await getApplicationOrigin();
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      integration_identifier: "list_to_ladle_web_qzmtplka",
      customer: customerId,
      client_reference_id: teamId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_update: {
        address: "auto",
        name: "auto",
      },
      metadata: { teamId },
      subscription_data: {
        metadata: { teamId },
      },
      success_url: `${origin}/settings/billing/success`,
      cancel_url: `${origin}/settings/billing?checkout=cancelled`,
    });

    if (!checkout.url) {
      throw new ZSAError("INTERNAL_SERVER_ERROR", "Stripe did not return a Checkout URL");
    }
    return { url: checkout.url };
  });

export const createBillingPortalAction = createServerAction()
  .handler(async () => {
    const { session, teamId } = await requireBillingManager();
    const customerId = await getOrCreateStripeCustomer({
      email: session.user.email,
      teamId,
    });
    const origin = await getApplicationOrigin();
    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings/billing`,
    });
    return { url: portal.url };
  });
