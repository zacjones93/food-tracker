import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { getDB } from "@/db";
import { RECIPE_TYPES, recipesTable, TEAM_PERMISSIONS } from "@/db/schema";
import { getSessionFromCookie } from "@/utils/auth";
import { hasPermission } from "@/utils/team-auth";

export default async function DialRecipeEditPage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  const { externalId } = await params;
  const session = await getSessionFromCookie();
  if (!session) redirect(`/sign-in?redirect=${encodeURIComponent(`/integrations/dial/recipes/${externalId}/edit`)}`);

  const recipe = await getDB().query.recipesTable.findFirst({
    where: and(
      eq(recipesTable.dialExternalId, externalId),
      eq(recipesTable.recipeType, RECIPE_TYPES.COFFEE_DRINK),
    ),
  });
  if (!recipe) notFound();

  const canEdit = await hasPermission(session.user.id, recipe.teamId, TEAM_PERMISSIONS.EDIT_RECIPES);
  if (!canEdit) notFound();
  redirect(`/recipes/${recipe.id}?edit=dial`);
}
