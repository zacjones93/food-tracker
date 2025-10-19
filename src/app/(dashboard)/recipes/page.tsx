import { Suspense } from "react";
import Link from "next/link";
import { getRecipesAction } from "./recipes.actions";
import { RecipesTableWrapper } from "./_components/recipes-table-wrapper";
import { RecipeFilters } from "./_components/recipe-filters";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface RecipesPageProps {
  searchParams: Promise<{
    page?: string;
    mealType?: string;
    difficulty?: string;
    seasons?: string | string[];
    minMealsEaten?: string;
    maxMealsEaten?: string;
    recipeBookId?: string;
    sortBy?: string;
  }>;
}

async function RecipesContent({ searchParams }: RecipesPageProps) {
  const params = await searchParams;

  const seasons = params.seasons
    ? Array.isArray(params.seasons)
      ? params.seasons
      : [params.seasons]
    : undefined;

  const [data] = await getRecipesAction({
    page: params.page ? parseInt(params.page) : 1,
    limit: 10000, // Fetch all for client-side search
    mealType: params.mealType,
    difficulty: params.difficulty,
    seasons,
    minMealsEaten: params.minMealsEaten ? parseInt(params.minMealsEaten) : undefined,
    maxMealsEaten: params.maxMealsEaten ? parseInt(params.maxMealsEaten) : undefined,
    recipeBookId: params.recipeBookId,
    sortBy: params.sortBy as "newest" | "mostEaten" | "name" | undefined,
  });

  const recipes = data?.recipes || [];
  const pagination = data?.pagination;

  return <RecipesTableWrapper recipes={recipes} pagination={pagination} />;
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const params = await searchParams;
  const suspenseKey = JSON.stringify(params);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:justify-between justify-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-center sm:text-left">Recipes</h1>
          <p className="text-muted-foreground">Manage your recipe collection</p>
        </div>
        <Button asChild>
          <Link href="/recipes/create">
            <Plus className="h-4 w-4 mr-2" />
            New Recipe
          </Link>
        </Button>
      </div>

      <RecipeFilters />

      <Suspense key={suspenseKey} fallback={<div className="flex justify-center py-12">Loading recipes...</div>}>
        <RecipesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
