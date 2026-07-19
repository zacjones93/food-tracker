"use client";

import { type Recipe } from "@/db/schema";
import { useRouter } from "next/navigation";
import { ChefHat } from "@/components/ui/themed-icons";

interface RecipeBookRecipesListProps {
  recipes: Recipe[];
}

export function RecipeBookRecipesList({ recipes }: RecipeBookRecipesListProps) {
  const router = useRouter();

  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ChefHat className="h-12 w-12 text-cream-700 dark:text-cream-200 mb-4" />
        <p className="text-lg font-medium text-cream-900 dark:text-cream-100">
          No recipes in this book yet
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <div className="divide-y">
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-cream-200/10 cursor-pointer transition-colors"
            onClick={() => router.push(`/recipes/${recipe.id}`)}
          >
            {recipe.emoji && (
              <span className="text-xl flex-shrink-0">{recipe.emoji}</span>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-cream-900 dark:text-cream-100">{recipe.name}</p>
            </div>
            {recipe.page && (
              <div className="flex-shrink-0 text-sm text-cream-700 dark:text-cream-200 font-mono">
                p. {recipe.page}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
