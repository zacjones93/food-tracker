import { getPublicRecipeByIdAction } from "@/app/(dashboard)/recipes/recipes.actions";
import { RecipeDetail } from "@/app/(dashboard)/recipes/[id]/_components/recipe-detail";
import { notFound } from "next/navigation";
import { getDialRecipeAvailability } from "@/lib/dial-integration";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PublicRecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  const [data, error] = await getPublicRecipeByIdAction({ id });

  if (error || !data?.recipe) {
    notFound();
  }

  const availability = await getDialRecipeAvailability(data.recipe);
  return <RecipeDetail availability={availability} canEdit={false} recipe={data.recipe} />;
}
