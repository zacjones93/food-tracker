import { Suspense } from "react";
import { getRecipesAction } from "./recipes.actions";
import { RecipesTable } from "./_components/recipes-table";
import { RecipeFilters } from "./_components/recipe-filters";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface RecipesPageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
    mealType?: string;
    difficulty?: string;
    tags?: string | string[];
    minMealsEaten?: string;
    maxMealsEaten?: string;
  }>;
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const params = await searchParams;

  // Parse tags from query string (can be single or array)
  const tags = params.tags
    ? Array.isArray(params.tags)
      ? params.tags
      : [params.tags]
    : undefined;

  const [data] = await getRecipesAction({
    search: params.search,
    page: params.page ? parseInt(params.page) : 1,
    mealType: params.mealType as any,
    difficulty: params.difficulty as any,
    tags,
    minMealsEaten: params.minMealsEaten ? parseInt(params.minMealsEaten) : undefined,
    maxMealsEaten: params.maxMealsEaten ? parseInt(params.maxMealsEaten) : undefined,
  });

  const recipes = data?.recipes || [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Recipes"
        description="Manage your recipe collection"
      >
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Recipe
        </Button>
      </PageHeader>

      <RecipeFilters />

      <Suspense fallback={<div>Loading...</div>}>
        <RecipesTable recipes={recipes} pagination={pagination} />
      </Suspense>
    </div>
  );
}
