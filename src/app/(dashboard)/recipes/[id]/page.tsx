import { getRecipeByIdAction } from "../recipes.actions";
import { RecipeDetail } from "./_components/recipe-detail";
import { notFound } from "next/navigation";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  const [data, error] = await getRecipeByIdAction({ id });

  if (error || !data?.recipe) {
    notFound();
  }

  return <RecipeDetail recipe={data.recipe} />;
}
