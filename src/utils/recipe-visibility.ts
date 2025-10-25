import "server-only";

import { eq, or, SQL } from "drizzle-orm";
import { recipesTable, RECIPE_VISIBILITY, type Recipe } from "@/db/schema";

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

/**
 * Checks if a user has access to a specific recipe
 * @param recipe - The recipe to check access for
 * @param userId - User ID (unused for now, kept for API compatibility)
 * @param activeTeamId - Current team ID
 * @returns true if user has access, false otherwise
 */
export function hasAccessToRecipe(
  recipe: Recipe,
  userId: string,
  activeTeamId: string
): boolean {
  // User has access if:
  // 1. Recipe belongs to their team, OR
  // 2. Recipe is public (from another team)
  return (
    recipe.teamId === activeTeamId ||
    recipe.visibility === RECIPE_VISIBILITY.PUBLIC
  );
}
