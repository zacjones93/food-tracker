import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDB } from "@/db";
import { teamTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { RecipeVisibilitySettings } from "./_components/recipe-visibility-settings";
import { DefaultRecipeVisibilitySettings } from "./_components/default-recipe-visibility-settings";

interface TeamSettingsPageProps {
  params: Promise<{ teamSlug: string }>;
}

async function TeamSettingsContent({ teamSlug }: { teamSlug: string }) {
  const session = await getSessionFromCookie();
  if (!session) {
    notFound();
  }

  const db = getDB();
  const team = await db.query.teamTable.findFirst({
    where: eq(teamTable.slug, teamSlug),
    with: {
      settings: true,
    },
  });

  if (!team) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Settings</h1>
        <p className="text-muted-foreground">Manage settings for {team.name}</p>
      </div>

      <RecipeVisibilitySettings
        teamId={team.id}
        currentMode={team.settings?.recipeVisibilityMode || 'all'}
      />

      <DefaultRecipeVisibilitySettings
        teamId={team.id}
        currentVisibility={team.settings?.defaultRecipeVisibility || 'public'}
      />
    </div>
  );
}

export default async function TeamSettingsPage({ params }: TeamSettingsPageProps) {
  const { teamSlug } = await params;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamSettingsContent teamSlug={teamSlug} />
    </Suspense>
  );
}
