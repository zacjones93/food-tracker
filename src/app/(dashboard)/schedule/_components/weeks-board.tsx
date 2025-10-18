"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Week, WeekRecipe, Recipe } from "@/db/schema";
import { WeekRecipesList } from "../[id]/_components/week-recipes-list";

interface WeeksBoardProps {
  weeks: (Week & {
    recipes: (WeekRecipe & { recipe: Recipe })[];
  })[];
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
            <h2 className="text-xl font-semibold">Current</h2>
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
            <h2 className="text-xl font-semibold">Upcoming</h2>
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
              <h2 className="text-xl font-semibold">Archived</h2>
              <Badge variant="outline">{groupedWeeks.archived.length}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
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
  week: Week & {
    recipes: (WeekRecipe & { recipe: Recipe })[];
  };
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
          <WeekRecipesList weekId={week.id} recipes={week.recipes} embedded />
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
                <span key={wr.recipe.id} className="text-lg">
                  {wr.recipe.emoji}
                </span>
              ))}
              {week.recipes.length > 6 && (
                <span className="text-xs text-muted-foreground self-center">
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
