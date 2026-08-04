import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDB } from "@/db";
import { recipesTable, teamSettingsTable, weeksTable } from "@/db/schema";
import { checkAiAccess } from "@/lib/ai/access-control";
import type { AssistantPageContext } from "@/lib/ai/assistant-context";
import { getSessionFromCookie } from "@/utils/auth";
import { getRecipeVisibilityConditions } from "@/utils/recipe-visibility";

export const runtime = "nodejs";

const RESULT_LIMIT = 8;

export async function GET(request: Request) {
  const session = await getSessionFromCookie();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.activeTeamId) {
    return Response.json({ error: "No active team" }, { status: 403 });
  }

  const access = await checkAiAccess({
    teamId: session.activeTeamId,
    userId: session.user.id,
  });
  if (!access.allowed) {
    return Response.json({ error: "AI assistant unavailable" }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const normalizedQuery = query.toLocaleLowerCase();
  const db = getDB();
  const teamSettings = await db.query.teamSettingsTable.findFirst({
    where: eq(teamSettingsTable.teamId, session.activeTeamId),
  });
  const visibilityMode = (teamSettings?.recipeVisibilityMode ?? "all") as
    | "all"
    | "team_only";
  const recipeNameCondition = normalizedQuery
    ? sql`lower(${recipesTable.name}) like ${`%${normalizedQuery}%`}`
    : undefined;
  const weekNameCondition = normalizedQuery
    ? sql`lower(${weeksTable.name}) like ${`%${normalizedQuery}%`}`
    : undefined;

  const [recipes, weeks] = await Promise.all([
    db
      .select({ id: recipesTable.id, name: recipesTable.name })
      .from(recipesTable)
      .where(
        and(
          getRecipeVisibilityConditions(session.activeTeamId, visibilityMode),
          recipeNameCondition,
        ),
      )
      .orderBy(asc(recipesTable.name))
      .limit(RESULT_LIMIT),
    db
      .select({ id: weeksTable.id, name: weeksTable.name })
      .from(weeksTable)
      .where(
        and(
          eq(weeksTable.teamId, session.activeTeamId),
          weekNameCondition,
        ),
      )
      .orderBy(desc(weeksTable.startDate), asc(weeksTable.name))
      .limit(RESULT_LIMIT),
  ]);

  const items: AssistantPageContext[] = [
    ...recipes.map((recipe) => ({
      kind: "recipe" as const,
      entityId: recipe.id,
      label: recipe.name,
      href: `/recipes/${recipe.id}`,
    })),
    ...weeks.map((week) => ({
      kind: "week" as const,
      entityId: week.id,
      label: week.name,
      href: `/schedule/${week.id}`,
    })),
  ]
    .sort((left, right) => {
      const leftStarts = left.label.toLocaleLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.label.toLocaleLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return left.label.localeCompare(right.label);
    })
    .slice(0, RESULT_LIMIT);

  return Response.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
