import { BillingActions } from "./billing-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDB } from "@/db";
import { TEAM_PERMISSIONS, teamSubscriptionsTable } from "@/db/schema";
import { getTeamEntitlements } from "@/lib/entitlements";
import { getStripe } from "@/lib/stripe";
import { getSessionFromCookie } from "@/utils/auth";
import { hasPermission } from "@/utils/team-auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

async function getPriceLabel(): Promise<string | null> {
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId || !process.env.STRIPE_SECRET_KEY) return null;

  try {
    const price = await getStripe().prices.retrieve(priceId);
    if (price.unit_amount === null) return null;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
    }).format(price.unit_amount / 100);
    return price.recurring ? `${amount} / ${price.recurring.interval}` : amount;
  } catch {
    return null;
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/sign-in");
  if (!session.activeTeamId) redirect("/settings/teams");

  const teamId = session.activeTeamId;
  const db = getDB();
  const [entitlements, subscription, canManage, priceLabel, query] = await Promise.all([
    getTeamEntitlements({ teamId }),
    db.query.teamSubscriptionsTable.findFirst({
      where: eq(teamSubscriptionsTable.teamId, teamId),
    }),
    hasPermission(session.user.id, teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS),
    getPriceLabel(),
    searchParams,
  ]);
  const isConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID);
  const hasSubscriptionAccess = entitlements.source !== "free";
  const hasAppleSubscriptionAccess = entitlements.providers.includes("apple");
  const hasStripeSubscriptionAccess = entitlements.providers.includes("stripe");
  const weeksRemaining = entitlements.usage.weeksRemaining;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">Billing</h1>
        <p className="text-mystic-700 dark:text-cream-200">
          One subscription unlocks Pro for everyone on the active team.
        </p>
      </div>

      {query.checkout === "success" && (
        <Alert>
          <AlertTitle>Subscription active</AlertTitle>
          <AlertDescription>Your team&apos;s Pro feature snapshot is ready.</AlertDescription>
        </Alert>
      )}
      {query.checkout === "pending" && (
        <Alert>
          <AlertTitle>Payment received</AlertTitle>
          <AlertDescription>Stripe is still confirming the subscription. This page will update after the webhook arrives.</AlertDescription>
        </Alert>
      )}
      {query.checkout === "cancelled" && (
        <Alert>
          <AlertTitle>Checkout cancelled</AlertTitle>
          <AlertDescription>No charge was made.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>{hasSubscriptionAccess ? "List To Ladle Pro" : "Free"}</CardTitle>
              <CardDescription>
                {hasSubscriptionAccess
                  ? `Feature snapshot v${entitlements.planVersion}`
                  : `${weeksRemaining ?? 0} of 4 week creations remaining`}
              </CardDescription>
            </div>
            <Badge variant={hasSubscriptionAccess ? "default" : "muted"}>
              {entitlements.subscriptionStatus === "none"
                ? "Free"
                : entitlements.subscriptionStatus.replaceAll("_", " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="font-medium">Week planning</p>
              <p className="text-sm text-muted-foreground">{hasSubscriptionAccess ? "Unlimited creations" : "4 lifetime creations"}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium">AI assistant</p>
              <p className="text-sm text-muted-foreground">{entitlements.features.aiAssistant ? "Included" : "Requires Pro"}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium">Push notifications</p>
              <p className="text-sm text-muted-foreground">{entitlements.features.pushNotifications ? "Included" : "Requires Pro"}</p>
            </div>
          </div>

          {!hasSubscriptionAccess && (
            <div>
              <p className="text-lg font-semibold">Upgrade to Pro {priceLabel && <span className="text-muted-foreground">· {priceLabel}</span>}</p>
              <p className="text-sm text-muted-foreground">Checkout and payment details are hosted by Stripe.</p>
            </div>
          )}

          {subscription?.currentPeriodEnd && hasStripeSubscriptionAccess && (
            <p className="text-sm text-muted-foreground">
              {subscription.cancelAtPeriodEnd ? "Access ends" : "Renews"} {subscription.currentPeriodEnd.toLocaleDateString()}.
              {subscription.paymentMethod?.last4 && ` Payment method ending in ${subscription.paymentMethod.last4}.`}
            </p>
          )}

          <BillingActions
            canManage={canManage}
            hasStripeCustomer={Boolean(subscription)}
            hasSubscriptionAccess={hasSubscriptionAccess}
            isConfigured={isConfigured}
          />
          {hasAppleSubscriptionAccess && (
            <p className="text-sm text-muted-foreground">
              The App Store subscription can be changed or cancelled from the List To Ladle iOS app or Apple subscription settings.
            </p>
          )}
          {!isConfigured && canManage && (
            <p className="text-sm text-destructive">Add the Stripe secrets and Pro price ID before opening Checkout.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
