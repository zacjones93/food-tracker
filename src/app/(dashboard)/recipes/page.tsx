import { Suspense } from "react";
import { getRecipesAction } from "./recipes.actions";
import { RecipesTable } from "./_components/recipes-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function RecipesPage() {
  const [data] = await getRecipesAction();
  const recipes = data?.recipes || [];

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

      <Suspense fallback={<div>Loading...</div>}>
        <RecipesTable recipes={recipes} />
      </Suspense>
    </div>
  );
}
