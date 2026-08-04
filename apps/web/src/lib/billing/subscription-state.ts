interface SubscriptionSummary {
  id: string;
  priceIds: string[];
  status: string;
}

const STATUS_PRIORITY = new Map([
  ["active", 0],
  ["trialing", 1],
  ["past_due", 2],
  ["unpaid", 3],
  ["incomplete", 4],
  ["paused", 5],
  ["canceled", 6],
  ["incomplete_expired", 7],
]);

export function selectRecognizedSubscriptionId({
  currentPriceId,
  grandfatheredSubscriptionIds,
  subscriptions,
}: {
  currentPriceId: string;
  grandfatheredSubscriptionIds: Set<string>;
  subscriptions: SubscriptionSummary[];
}): string | null {
  let selected: SubscriptionSummary | null = null;

  for (const subscription of subscriptions) {
    const isRecognized = grandfatheredSubscriptionIds.has(subscription.id)
      || subscription.priceIds.includes(currentPriceId);
    if (!isRecognized) continue;

    const selectedPriority = selected
      ? (STATUS_PRIORITY.get(selected.status) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    const candidatePriority = STATUS_PRIORITY.get(subscription.status)
      ?? Number.MAX_SAFE_INTEGER;
    if (!selected || candidatePriority < selectedPriority) selected = subscription;
  }

  return selected?.id ?? null;
}
