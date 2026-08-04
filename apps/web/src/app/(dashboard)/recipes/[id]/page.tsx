import { getPublicRecipeByIdAction } from "../recipes.actions";
import { RecipeDetail } from "./_components/recipe-detail";
import { notFound } from "next/navigation";
import { AssistantPageContext } from "@/components/assistant/assistant-provider";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  const [data, error] = await getPublicRecipeByIdAction({ id });

  if (error || !data?.recipe) {
    notFound();
  }

  const [sourceData] = data.recipe.sourceRecipeId
    ? await getPublicRecipeByIdAction({ id: data.recipe.sourceRecipeId })
    : [null];

  return (
    <>
      <AssistantPageContext
        context={{
          kind: "recipe",
          entityId: data.recipe.id,
          label: data.recipe.name,
          href: `/recipes/${data.recipe.id}`,
        }}
      />
      <RecipeDetail
        recipe={data.recipe}
        sourceRecipe={sourceData?.recipe ?? null}
        relationsAsMain={data.relationsAsMain}
        relationsAsSide={data.relationsAsSide}
      />
    </>
  );
}
