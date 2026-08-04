"use client";

import {
  createBillingPortalAction,
  createSubscriptionCheckoutAction,
} from "@/actions/billing.actions";
import { Button } from "@/components/ui/button";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";

export function BillingActions({
  canManage,
  hasStripeCustomer,
  hasSubscriptionAccess,
  isConfigured,
}: {
  canManage: boolean;
  hasStripeCustomer: boolean;
  hasSubscriptionAccess: boolean;
  isConfigured: boolean;
}) {
  const checkout = useServerAction(createSubscriptionCheckoutAction);
  const portal = useServerAction(createBillingPortalAction);

  async function openCheckout() {
    const [data, error] = await checkout.execute();
    if (error || !data?.url) {
      toast.error(error?.message ?? "Unable to open Stripe Checkout");
      return;
    }
    window.location.assign(data.url);
  }

  async function openPortal() {
    const [data, error] = await portal.execute();
    if (error || !data?.url) {
      toast.error(error?.message ?? "Unable to open the billing portal");
      return;
    }
    window.location.assign(data.url);
  }

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">Ask a team owner or admin to manage this subscription.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {!hasSubscriptionAccess && (
        <Button
          variant="mystic"
          onClick={openCheckout}
          disabled={!isConfigured || checkout.isPending}
        >
          {checkout.isPending ? "Opening Checkout…" : "Subscribe with Stripe"}
        </Button>
      )}
      {hasStripeCustomer && (
        <Button variant="outline" onClick={openPortal} disabled={portal.isPending}>
          {portal.isPending ? "Opening portal…" : "Manage billing"}
        </Button>
      )}
    </div>
  );
}
