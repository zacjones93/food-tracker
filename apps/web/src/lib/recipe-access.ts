interface RecipeAccessInput {
  recipe: { teamId: string; visibility: string };
  activeTeamId?: string | null;
}

export function canViewRecipeByLink({ recipe, activeTeamId }: RecipeAccessInput): boolean {
  return recipe.visibility === "public"
    || recipe.visibility === "unlisted"
    || Boolean(activeTeamId && recipe.teamId === activeTeamId);
}
