import { getPublicRecipeByIdAction } from "@/app/(dashboard)/recipes/recipes.actions";
import { RecipeDetail } from "@/app/(dashboard)/recipes/[id]/_components/recipe-detail";
import { notFound } from "next/navigation";

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

  return <RecipeDetail recipe={data.recipe} />;
}
