import { getDB } from "@/db";
import { teamSubscriptionsTable } from "@/db/schema";
import { syncStripeDataForCustomer } from "@/lib/billing/stripe-sync";
import { getSessionFromCookie } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function BillingSuccessPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/sign-in");
  if (!session.activeTeamId) redirect("/settings/teams");

  const binding = await getDB().query.teamSubscriptionsTable.findFirst({
    where: eq(teamSubscriptionsTable.teamId, session.activeTeamId),
  });
  if (!binding) redirect("/settings/billing?checkout=pending");

  let outcome = "pending";
  try {
    const synced = await syncStripeDataForCustomer({ customerId: binding.stripeCustomerId });
    outcome = synced.hasAccess ? "success" : "pending";
  } catch (error) {
    console.error("Unable to eagerly synchronize Stripe after Checkout", error);
    outcome = "pending";
  }
  redirect(`/settings/billing?checkout=${outcome}`);
}
