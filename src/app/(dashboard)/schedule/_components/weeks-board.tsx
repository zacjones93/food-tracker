"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Week } from "@/db/schema";

interface WeeksBoardProps {
  weeks: (Week & {
    recipes: {
      recipe: {
        id: string;
        name: string;
        emoji: string | null;
      };
    }[];
  })[];
}

export function WeeksBoard({ weeks }: WeeksBoardProps) {
  const groupedWeeks = {
    current: weeks.filter((w) => w.status === "current"),
    upcoming: weeks.filter((w) => w.status === "upcoming"),
    archived: weeks.filter((w) => w.status === "archived"),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Current Column */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Current</h2>
          <Badge variant="default">{groupedWeeks.current.length}</Badge>
        </div>
        <div className="space-y-3">
          {groupedWeeks.current.map((week) => (
            <WeekCard key={week.id} week={week} />
          ))}
        </div>
      </div>

      {/* Upcoming Column */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <Badge variant="secondary">{groupedWeeks.upcoming.length}</Badge>
        </div>
        <div className="space-y-3">
          {groupedWeeks.upcoming.map((week) => (
            <WeekCard key={week.id} week={week} />
          ))}
        </div>
      </div>

      {/* Archived Column */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Archived</h2>
          <Badge variant="outline">{groupedWeeks.archived.length}</Badge>
        </div>
        <div className="space-y-3">
          {groupedWeeks.archived.map((week) => (
            <WeekCard key={week.id} week={week} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekCard({
  week,
}: {
  week: Week & {
    recipes: {
      recipe: {
        id: string;
        name: string;
        emoji: string | null;
      };
    }[];
  };
}) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {week.emoji && <span className="text-2xl">{week.emoji}</span>}
          <span>{week.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          {week.recipes.length} recipe{week.recipes.length !== 1 ? "s" : ""}
        </div>
        {week.recipes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {week.recipes.slice(0, 3).map((wr) => (
              <span key={wr.recipe.id} className="text-lg">
                {wr.recipe.emoji}
              </span>
            ))}
            {week.recipes.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{week.recipes.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
