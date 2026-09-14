import { getPublicRecipeByIdAction } from "@/app/(dashboard)/recipes/recipes.actions";
import { RecipeDetail } from "@/app/(dashboard)/recipes/[id]/_components/recipe-detail";
import { SITE_NAME } from "@/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
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

const getRecipe = cache(async (id: string) => {
  const [data, error] = await getPublicRecipeByIdAction({ id });
  if (error || !data?.recipe) notFound();
  return data;
});

function getRecipeDescription({ name, recipeBody }: { name: string; recipeBody: string | null }) {
  const description = recipeBody
    ?.replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(?:^|\n)\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/g, " ")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!description) return `View ${name} on ${SITE_NAME}.`;
  return description.length > 160
    ? `${description.slice(0, 159).trimEnd()}…`
    : description;
}

export async function generateMetadata({ params }: RecipePageProps): Promise<Metadata> {
  const { id } = await params;
  const { recipe } = await getRecipe(id);
  const description = getRecipeDescription(recipe);
  const url = `/recipes/${encodeURIComponent(id)}`;

  return {
    title: recipe.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: recipe.name,
      description,
      url,
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.name,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function RecipePage({ params, searchParams }: RecipePageProps) {
  const { id } = await params;
  const { edit } = await searchParams;

  const data = await getRecipe(id);

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
      {session && <AssistantPageContext
        context={{
          kind: "recipe",
          entityId: data.recipe.id,
          label: data.recipe.name,
          href: `/recipes/${data.recipe.id}`,
        }}
      />}
      <RecipeDetail
        isAuthenticated={Boolean(session)}
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
