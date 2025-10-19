import "server-only";

import { eq, or, SQL } from "drizzle-orm";
import { recipesTable, RECIPE_VISIBILITY } from "@/db/schema";

/**
 * Returns visibility conditions based on team settings
 * @param activeTeamId - Current team ID
 * @param recipeVisibilityMode - Team's recipe visibility mode ('all' or 'team_only')
 * @returns SQL condition for filtering recipes based on team settings
 */
export function getRecipeVisibilityConditions(
  activeTeamId: string,
  recipeVisibilityMode: 'all' | 'team_only' = 'all'
): SQL {
  if (recipeVisibilityMode === 'team_only') {
    // Show only own team's recipes (all visibilities)
    return eq(recipesTable.teamId, activeTeamId);
  }

  // Show own team's recipes (all visibilities) + other teams' public recipes
  return or(
    eq(recipesTable.teamId, activeTeamId),
    eq(recipesTable.visibility, RECIPE_VISIBILITY.PUBLIC)
  )!;
}
