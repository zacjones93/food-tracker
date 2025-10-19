"use client";

import { useEffect } from "react";
import { useQueryStates, parseAsString, parseAsInteger, parseAsArrayOf } from "nuqs";
import { useServerAction } from "zsa-react";
import { getRecipesAction } from "../recipes.actions";
import { RecipeFilters } from "./recipe-filters";
import { RecipesTable } from "./recipes-table";

export function RecipesContent() {
  const [filters] = useQueryStates(
    {
      search: parseAsString,
      mealType: parseAsString,
      difficulty: parseAsString,
      seasons: parseAsArrayOf(parseAsString),
      minMealsEaten: parseAsInteger,
      maxMealsEaten: parseAsInteger,
      recipeBookId: parseAsString,
      page: parseAsInteger.withDefault(1),
    },
    {
      history: "push",
    }
  );

  const { execute: fetchRecipes, data, isPending, error } = useServerAction(getRecipesAction);

  // Fetch recipes whenever filters change
  useEffect(() => {
    fetchRecipes({
      search: filters.search || undefined,
      page: filters.page,
      limit: 25,
      mealType: filters.mealType || undefined,
      difficulty: filters.difficulty || undefined,
      seasons: filters.seasons || undefined,
      minMealsEaten: filters.minMealsEaten || undefined,
      maxMealsEaten: filters.maxMealsEaten || undefined,
      recipeBookId: filters.recipeBookId || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.search,
    filters.page,
    filters.mealType,
    filters.difficulty,
    filters.seasons,
    filters.minMealsEaten,
    filters.maxMealsEaten,
    filters.recipeBookId,
  ]);

  const recipes = data?.recipes || [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6">
      <RecipeFilters />

      {error && (
        <div className="flex justify-center py-12 text-red-500">
          Error: {error.message}
        </div>
      )}

      {isPending && !data ? (
        <div className="flex justify-center py-12">Loading recipes...</div>
      ) : (
        <RecipesTable recipes={recipes} pagination={pagination} />
      )}
    </div>
  );
}
