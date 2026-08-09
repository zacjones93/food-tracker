import { getPublicRecipeByIdAction } from "../recipes.actions";
import { RecipeDetail } from "./_components/recipe-detail";
import { notFound } from "next/navigation";
import { AssistantPageContext } from "@/components/assistant/assistant-provider";
import { TEAM_PERMISSIONS } from "@/db/schema";
import { getDialRecipeAvailability } from "@/lib/dial-integration";
import { getSessionFromCookie } from "@/utils/auth";
import { hasPermission } from "@/utils/team-auth";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function RecipePage({ params, searchParams }: RecipePageProps) {
  const { id } = await params;
  const { edit } = await searchParams;

  const [data, error] = await getPublicRecipeByIdAction({ id });

  if (error || !data?.recipe) {
    notFound();
  }

  const [sourceData] = data.recipe.sourceRecipeId
    ? await getPublicRecipeByIdAction({ id: data.recipe.sourceRecipeId })
    : [null];
  const session = await getSessionFromCookie();
  const [availability, canEdit] = await Promise.all([
    getDialRecipeAvailability(data.recipe),
    session
      ? hasPermission(session.user.id, data.recipe.teamId, TEAM_PERMISSIONS.EDIT_RECIPES)
      : Promise.resolve(false),
  ]);

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
        availability={availability}
        canEdit={canEdit}
        initiallyEdit={edit === "dial" && canEdit}
        sourceRecipe={sourceData?.recipe ?? null}
        relationsAsMain={data.relationsAsMain}
        relationsAsSide={data.relationsAsSide}
      />
    </>
  );
}
