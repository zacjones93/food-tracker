import { syncStripeDataForCustomer } from "@/lib/billing/stripe-sync";
import { getStripe } from "@/lib/stripe";

const SUBSCRIPTION_STATE_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "invoice.finalization_failed",
]);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Stripe webhook is not configured" }, { status: 400 });
  }

  let event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (!SUBSCRIPTION_STATE_EVENTS.has(event.type)) {
    return Response.json({ received: true, ignored: true });
  }

  const customer = (event.data.object as { customer?: unknown }).customer;
  if (typeof customer !== "string") {
    console.error("Tracked Stripe event did not contain a customer ID", { eventId: event.id, eventType: event.type });
    return Response.json({ error: "Missing customer ID" }, { status: 400 });
  }

  try {
    const outcome = await syncStripeDataForCustomer({ customerId: customer });
    if (outcome.status === "unbound") {
      console.info("Ignoring Stripe event for an unbound customer", {
        eventId: event.id,
        eventType: event.type,
      });
      return Response.json({ received: true, ignored: true });
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe subscription synchronization failed", { eventId: event.id, error });
    return Response.json({ error: "Subscription synchronization failed" }, { status: 500 });
  }
}
