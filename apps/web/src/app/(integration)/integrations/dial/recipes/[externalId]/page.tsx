import { and, eq, inArray, or } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDB } from "@/db";
import { RECIPE_TYPES, RECIPE_VISIBILITY, recipesTable } from "@/db/schema";
import { getDialRecipeAvailability } from "@/lib/dial-integration";
import { getSessionFromCookie } from "@/utils/auth";

export default async function DialRecipeFallbackPage({
  params,
}: {
  params: Promise<{ externalId: string }>;
}) {
  const { externalId } = await params;
  const session = await getSessionFromCookie();
  const recipe = await getDB().query.recipesTable.findFirst({
    where: and(
      eq(recipesTable.dialExternalId, externalId),
      eq(recipesTable.recipeType, RECIPE_TYPES.COFFEE_DRINK),
      or(
        inArray(recipesTable.visibility, [RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.UNLISTED]),
        session?.activeTeamId ? eq(recipesTable.teamId, session.activeTeamId) : undefined,
      ),
    ),
  });
  if (!recipe) notFound();
  const availability = await getDialRecipeAvailability(recipe);

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge>Coffee drink</Badge>
            <Badge variant="outline">{recipe.visibility}</Badge>
          </div>
          <CardTitle>{recipe.emoji ? `${recipe.emoji} ` : ""}{recipe.name}</CardTitle>
          <CardDescription>{availability.detail}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {availability.openUrl && availability.state !== "awaiting_team_pairing" && (
            <Button asChild><a href={availability.openUrl}>Open in Dial Your Espresso</a></Button>
          )}
          {!session && (
            <Button variant="outline" asChild>
              <a href={`/sign-in?redirect=${encodeURIComponent(`/integrations/dial/recipes/${externalId}`)}`}>
                Sign in to List To Ladle
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
