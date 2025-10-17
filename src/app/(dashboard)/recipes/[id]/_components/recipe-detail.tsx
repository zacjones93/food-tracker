"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Recipe } from "@/db/schema";
import { format } from "date-fns";
import { ArrowLeft, Clock, ChefHat, Calendar, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface RecipeDetailProps {
  recipe: Recipe;
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {recipe.emoji && (
              <span className="text-4xl">{recipe.emoji}</span>
            )}
            <h1 className="text-3xl font-bold">{recipe.name}</h1>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <Card className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {recipe.mealType && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <ChefHat className="h-4 w-4" />
                Meal Type
              </div>
              <Badge variant="outline">{recipe.mealType}</Badge>
            </div>
          )}

          {recipe.difficulty && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Difficulty
              </div>
              <Badge
                variant={
                  recipe.difficulty === "Easy"
                    ? "default"
                    : recipe.difficulty === "Medium"
                    ? "secondary"
                    : "destructive"
                }
              >
                {recipe.difficulty}
              </Badge>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Times Made
            </div>
            <div className="font-medium">{recipe.mealsEatenCount}</div>
          </div>

          {recipe.lastMadeDate && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Last Made
              </div>
              <div className="font-medium">
                {format(new Date(recipe.lastMadeDate), "MMM d, yyyy")}
              </div>
            </div>
          )}
        </div>

        {recipe.tags && recipe.tags.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Tags</div>
              <div className="flex gap-2 flex-wrap">
                {recipe.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Ingredients */}
      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Ingredients</h2>
          <ul className="space-y-2">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{ingredient}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recipe Body */}
      {recipe.recipeBody && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{recipe.recipeBody}</ReactMarkdown>
          </div>
        </Card>
      )}

      {(!recipe.ingredients || recipe.ingredients.length === 0) &&
        !recipe.recipeBody && (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">
              No recipe content added yet.
            </p>
          </Card>
        )}
    </div>
  );
}
