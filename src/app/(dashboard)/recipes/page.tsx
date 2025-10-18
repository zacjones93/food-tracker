import { Suspense } from "react";
import Link from "next/link";
import { getRecipesAction } from "./recipes.actions";
import { RecipesTable } from "./_components/recipes-table";
import { RecipeFilters } from "./_components/recipe-filters";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RecipesPageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
    mealType?: string;
    difficulty?: string;
    tags?: string | string[];
    seasons?: string | string[];
    minMealsEaten?: string;
    maxMealsEaten?: string;
    recipeBookId?: string;
  }>;
}

async function RecipesContent({ searchParams }: RecipesPageProps) {
  const params = await searchParams;

  // Parse tags from query string (can be single or array)
  const tags = params.tags
    ? Array.isArray(params.tags)
      ? params.tags
      : [params.tags]
    : undefined;

  // Parse seasons from query string (can be single or array)
  const seasons = params.seasons
    ? Array.isArray(params.seasons)
      ? params.seasons
      : [params.seasons]
    : undefined;

  const [data] = await getRecipesAction({
    search: params.search,
    page: params.page ? parseInt(params.page) : 1,
    mealType: params.mealType,
    difficulty: params.difficulty,
    tags,
    seasons,
    minMealsEaten: params.minMealsEaten ? parseInt(params.minMealsEaten) : undefined,
    maxMealsEaten: params.maxMealsEaten ? parseInt(params.maxMealsEaten) : undefined,
    recipeBookId: params.recipeBookId,
  });

  const recipes = data?.recipes || [];
  const pagination = data?.pagination;

  return <RecipesTable recipes={recipes} pagination={pagination} />;
}

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const params = await searchParams;
  // Create a key from search params to force Suspense re-mount when filters change
  const suspenseKey = JSON.stringify(params);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </div>
      </header>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Recipes</h1>
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
    </>
  );
}
