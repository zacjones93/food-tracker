"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "@/components/ui/themed-icons";
import type { Week, WeekRecipe, Recipe } from "@/db/schema";

interface WeekSummary extends Pick<Week, "id" | "name" | "emoji" | "status"> {
  recipes: Array<Pick<WeekRecipe, "id"> & {
    recipe: Pick<Recipe, "id" | "name" | "emoji">;
  }>;
}

interface WeeksBoardProps {
  weeks: WeekSummary[];
}

export function WeeksBoard({ weeks }: WeeksBoardProps) {
  const [showArchived, setShowArchived] = useState(false);

  const groupedWeeks = {
    current: weeks.filter((w) => w.status === "current"),
    upcoming: weeks.filter((w) => w.status === "upcoming"),
    archived: weeks.filter((w) => w.status === "archived"),
  };

  return (
    <div className="space-y-8">
      {/* Current Weeks - Expanded */}
      {groupedWeeks.current.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-mystic-900 dark:text-cream-100">Current</h2>
            <Badge variant="default">{groupedWeeks.current.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groupedWeeks.current.map((week) => (
              <WeekCard key={week.id} week={week} expanded />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Weeks - Compact */}
      {groupedWeeks.upcoming.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-mystic-900 dark:text-cream-100">Upcoming</h2>
            <Badge variant="secondary">{groupedWeeks.upcoming.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedWeeks.upcoming.map((week) => (
              <WeekCard key={week.id} week={week} />
            ))}
          </div>
        </div>
      )}

      {/* Archived Weeks - Collapsible */}
      {groupedWeeks.archived.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-mystic-900 dark:text-cream-100">Archived</h2>
              <Badge variant="outline">{groupedWeeks.archived.length}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2 dark:text-cream-200" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2 dark:text-cream-200" />
                  Show
                </>
              )}
            </Button>
          </div>

          {showArchived && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedWeeks.archived.map((week) => (
                <WeekCard key={week.id} week={week} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeekCard({
  week,
  expanded = false,
}: {
  week: WeekSummary;
  expanded?: boolean;
}) {
  if (expanded) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader>
          <Link href={`/schedule/${week.id}`}>
            <CardTitle className="text-base flex items-center gap-2 hover:underline">
              {week.emoji && <span className="text-2xl">{week.emoji}</span>}
              <span>{week.name}</span>
              <Badge variant="outline" className="ml-auto">
                {week.recipes.length} recipe{week.recipes.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          <WeekRecipePreview week={week} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={`/schedule/${week.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {week.emoji && <span className="text-2xl">{week.emoji}</span>}
            <span>{week.name}</span>
            <Badge variant="outline" className="ml-auto">
              {week.recipes.length} recipe{week.recipes.length !== 1 ? "s" : ""}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Compact view - show emoji preview */}
          {week.recipes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {week.recipes.slice(0, 6).map((wr) => (
                <span key={wr.id} className="text-lg">
                  {wr.recipe.emoji}
                </span>
              ))}
              {week.recipes.length > 6 && (
                <span className="text-xs text-mystic-700 dark:text-cream-300 self-center">
                  +{week.recipes.length - 6}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function WeekRecipePreview({ week }: { week: WeekSummary }) {
  if (week.recipes.length === 0) {
    return (
      <p className="text-sm text-mystic-700 dark:text-cream-200">
        No recipes added yet.
      </p>
    );
  }

  const visibleRecipes = week.recipes.slice(0, 5);
  const remainingCount = week.recipes.length - visibleRecipes.length;

  return (
    <div className="space-y-2">
      {visibleRecipes.map(({ id, recipe }) => (
        <Link
          key={id}
          href={`/recipes/${recipe.id}`}
          className="flex min-h-11 items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-mystic-50 dark:hover:bg-cream-200/10"
        >
          <span className="text-lg" aria-hidden="true">
            {recipe.emoji || "🍽️"}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-mystic-900 dark:text-cream-100">
            {recipe.name}
          </span>
        </Link>
      ))}
      {remainingCount > 0 ? (
        <Link
          href={`/schedule/${week.id}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-mystic-700 hover:underline dark:text-cream-200"
        >
          View {remainingCount} more recipe{remainingCount === 1 ? "" : "s"}
        </Link>
      ) : null}
    </div>
  );
}
