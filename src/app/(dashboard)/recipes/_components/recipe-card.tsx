"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Recipe } from "@/db/schema";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AddToSchedule } from "./add-to-schedule";

interface RecipeWithWeekInfo extends Recipe {
  latestWeekId: string | null;
  latestWeekName: string | null;
}

interface RecipeCardProps {
  recipe: RecipeWithWeekInfo;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const router = useRouter();

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Header: Name + Emoji */}
        <div
          className="flex items-start gap-2 cursor-pointer"
          onClick={() => router.push(`/recipes/${recipe.id}`)}
        >
          {recipe.emoji && (
            <span className="text-2xl flex-shrink-0">{recipe.emoji}</span>
          )}
          <h3 className="font-semibold text-lg flex-1 line-clamp-2">{recipe.name}</h3>
        </div>

        {/* Badges: Meal Type + Difficulty */}
        <div className="flex gap-2 flex-wrap">
          {recipe.mealType && (
            <Badge variant="outline" className="text-xs">
              {recipe.mealType}
            </Badge>
          )}
          {recipe.difficulty && (
            <Badge
              variant={
                recipe.difficulty === "Easy"
                  ? "default"
                  : recipe.difficulty === "Medium"
                  ? "secondary"
                  : "destructive"
              }
              className="text-xs"
            >
              {recipe.difficulty}
            </Badge>
          )}
        </div>

        {/* Tags - Limit to 3 */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {recipe.tags.slice(0, 3).map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {recipe.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{recipe.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Stats: Meals Eaten + Last Made */}
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex justify-between items-center">
            <span>Times made:</span>
            <span className="font-medium">{recipe.mealsEatenCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Last made:</span>
            {recipe.latestWeekId && recipe.latestWeekName ? (
              <Link href={`/schedule/${recipe.latestWeekId}`}>
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 -mr-2">
                  <span className="text-xs">{recipe.latestWeekName}</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            ) : (
              <span className="font-medium">Never</span>
            )}
          </div>
        </div>

        {/* Add to Schedule Button */}
        <div className="pt-2 border-t">
          <AddToSchedule recipeId={recipe.id} variant="default" size="sm" showLabel={true} />
        </div>
      </div>
    </Card>
  );
}
