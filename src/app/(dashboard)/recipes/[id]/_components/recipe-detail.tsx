"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Recipe, RecipeBook } from "@/db/schema";
import { format } from "date-fns";
import { ArrowLeft, Clock, ChefHat, Calendar, Plus, ExternalLink, BookOpen } from "@/components/ui/themed-icons";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { AddToSchedule } from "../../_components/add-to-schedule";
import { AddIngredientToWeek } from "../../_components/add-ingredient-to-week";
import { AddAllIngredientsToWeek } from "../../_components/add-all-ingredients-to-week";
import { EditIngredientsDialog } from "./edit-ingredients-dialog";
import { EditInstructionsDialog } from "./edit-instructions-dialog";
import { EditRecipeDialog } from "./edit-recipe-dialog";
import { useSessionStore } from "@/state/session";

interface RecipeDetailProps {
  recipe: Recipe & {
    recipeBook?: RecipeBook | null;
  };
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const router = useRouter();
  const session = useSessionStore();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="md:self-start self-start absolute left-6 md:relative md:left-0"
        >
          <ArrowLeft className="h-4 w-4 text-cream-100" />
        </Button>
        <div className="flex-1 w-full md:w-auto">
          <div className="flex flex-col md:flex-row items-center md:items-center gap-3 mb-2">
            {recipe.emoji && (
              <span className="text-4xl">{recipe.emoji}</span>
            )}
            <h1 className="text-3xl font-bold text-center md:text-left">{recipe.name}</h1>
            {session.session?.user && <EditRecipeDialog recipe={recipe} />}
          </div>
        </div>
        {session.session?.user && <AddToSchedule recipeId={recipe.id} variant="default" />}
      </div>

      {/* Metadata */}
      <Card className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {recipe.mealType && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-cream-100" />
                Meal Type
              </div>
              <Badge variant="outline">{recipe.mealType}</Badge>
            </div>
          )}

          {recipe.difficulty && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-cream-100" />
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
              <Plus className="h-4 w-4 text-cream-100" />
              Times Made
            </div>
            <div className="font-medium">{recipe.mealsEatenCount}</div>
          </div>

          {recipe.lastMadeDate && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-cream-100" />
                Last Made
              </div>
              <div className="font-medium">
                {format(new Date(recipe.lastMadeDate), "MMM d, yyyy")}
              </div>
            </div>
          )}
        </div>

        {(recipe.recipeLink || recipe.recipeBook) && (
          <>
            <Separator className="my-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recipe.recipeLink && (
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-cream-100" />
                    Recipe Link
                  </div>
                  <a
                    href={recipe.recipeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mystic-600 dark:text-cream-200 hover:underline flex items-center gap-1 text-sm"
                  >
                    View Original
                    <ExternalLink className="h-3 w-3 text-cream-100" />
                  </a>
                </div>
              )}

              {recipe.recipeBook && (
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-cream-100" />
                    Recipe Book
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{recipe.recipeBook.name}</span>
                    {recipe.page && (
                      <Badge variant="outline" className="text-xs">
                        p. {recipe.page}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

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
      {recipe.ingredients && recipe.ingredients.length > 0 ? (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Ingredients</h2>
            {session.session?.user && (
              <div className="flex gap-2">
                <AddAllIngredientsToWeek ingredients={recipe.ingredients} />
                <EditIngredientsDialog recipe={recipe} />
              </div>
            )}
          </div>
          <ul className="space-y-2">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-mystic-600 dark:text-cream-200 mt-1">•</span>
                <span className="flex-1">{ingredient}</span>
                {session.session?.user && <AddIngredientToWeek ingredient={ingredient} />}
              </li>
            ))}
          </ul>
        </Card>
      ) : session.session?.user ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">
            No ingredients added yet.
          </p>
          <EditIngredientsDialog recipe={recipe} />
        </Card>
      ) : null}

      {/* Recipe Body */}
      {recipe.recipeBody ? (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Instructions</h2>
            {session.session?.user && <EditInstructionsDialog recipe={recipe} />}
          </div>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{recipe.recipeBody}</ReactMarkdown>
          </div>
        </Card>
      ) : session.session?.user ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">
            No instructions added yet.
          </p>
          <EditInstructionsDialog recipe={recipe} />
        </Card>
      ) : null}
    </div>
  );
}
