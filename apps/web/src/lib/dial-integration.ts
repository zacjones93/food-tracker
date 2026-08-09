import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";

import { getDB } from "@/db";
import {
  dialRecipeEventsTable,
  RECIPE_TYPES,
  RECIPE_VISIBILITY,
  recipesTable,
  type Recipe,
} from "@/db/schema";
import { createDialRepository } from "@/lib/dial-repository";

function getConfiguration() {
  return {
    appOrigin: "https://listtoladle.com",
    dialAppOrigin: "https://dialyourespresso.online",
  };
}

function repository() {
  return createDialRepository({ configuration: getConfiguration(), db: getDB() });
}

function logIntegrationError({ error, event }: { error: unknown; event: string }) {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    event,
    integration: "dial_your_espresso",
  }));
}

export async function publishDialRecipeChange({
  current,
  previous,
  reason,
}: {
  current: Recipe | null;
  previous: Recipe | null;
  reason?: "recipe_deleted" | "recipe_type_changed" | "team_pairing_required" | "team_pairing_disconnected";
}): Promise<void> {
  try {
    const recorded = await repository().recordRecipeEvent({ current, previous, reason });
    if (!recorded) return;
    try {
      const { env } = await getCloudflareContext({ async: true });
      await env.DIAL_RECIPE_EVENTS.send(recorded.event, { contentType: "json" });
      await getDB().update(dialRecipeEventsTable).set({
        queuedAt: new Date(),
        status: "queued",
        lastError: null,
      }).where(eq(dialRecipeEventsTable.id, recorded.eventId));
    } catch (error) {
      logIntegrationError({ error, event: "dial_recipe_event_queue_failed" });
    }
  } catch (error) {
    // Integration bookkeeping is deliberately outside the recipe save's
    // success condition. A later backfill repairs any missed projection.
    logIntegrationError({ error, event: "dial_recipe_event_record_failed" });
  }
}

export async function getDialRecipeAvailability(recipe: Recipe) {
  return repository().availabilityForRecipe(recipe);
}

export async function getDialConnectionIntent(intentToken: string) {
  return repository().findConnectionIntent(intentToken);
}

export async function approveDialConnectionIntent({
  intentToken,
  teamId,
  userId,
}: {
  intentToken: string;
  teamId?: string;
  userId: string;
}) {
  return repository().approveConnectionIntent({ intentToken, teamId, userId });
}

export async function getDialConnectionStatus({ teamId, userId }: { teamId?: string; userId: string }) {
  return repository().getConnectionStatus({ teamId, userId });
}

export async function disconnectDialAccount(userId: string) {
  await repository().disconnectAccount(userId);
}

export async function disconnectDialTeam(teamId: string) {
  const db = getDB();
  const recipes = await db.query.recipesTable.findMany({
    where: and(
      eq(recipesTable.teamId, teamId),
      eq(recipesTable.recipeType, RECIPE_TYPES.COFFEE_DRINK),
      eq(recipesTable.visibility, RECIPE_VISIBILITY.PRIVATE),
    ),
  });
  await repository().disconnectTeam(teamId);
  for (const recipe of recipes) {
    await publishDialRecipeChange({
      current: recipe,
      previous: recipe,
      reason: "team_pairing_disconnected",
    });
  }
}
