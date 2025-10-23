"use client";

import { useState, useEffect } from "react";
import { type Recipe, type WeekRecipe } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RELATION_TYPES } from "@/schemas/recipe-relation.schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
} from "@/components/ui/themed-icons";
import { useServerAction } from "zsa-react";
import {
  reorderWeekRecipesAction,
  removeRecipeFromWeekAction,
  toggleWeekRecipeMadeAction,
} from "../../weeks.actions";
import { toast } from "sonner";
import { AddRecipeDialog } from "./add-recipe-dialog";
import { useRouter } from "next/navigation";

interface WeekRecipesListProps {
  weekId: string;
  recipes: (WeekRecipe & { recipe: Recipe })[];
  embedded?: boolean;
}

export function WeekRecipesList({
  weekId,
  recipes: initialRecipes,
  embedded = false,
}: WeekRecipesListProps) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [isMounted, setIsMounted] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showMade, setShowMade] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { execute: reorderRecipes } = useServerAction(
    reorderWeekRecipesAction,
    {
      onError: ({ err }) => {
        toast.error(err.message || "Failed to reorder recipes");
        setRecipes(initialRecipes);
      },
    }
  );

  const { execute: removeRecipe } = useServerAction(
    removeRecipeFromWeekAction,
    {
      onSuccess: () => {
        toast.success("Recipe removed from week");
      },
      onError: ({ err }) => {
        toast.error(err.message || "Failed to remove recipe");
      },
    }
  );

  const { execute: toggleMade } = useServerAction(toggleWeekRecipeMadeAction, {
    onSuccess: () => {
      toast.success("Recipe status updated");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update recipe status");
    },
  });

  const handleRemoveRecipe = async (recipeId: string) => {
    // Optimistically update UI
    setRecipes((prev) => prev.filter((r) => r.recipe.id !== recipeId));
    await removeRecipe({ weekId, recipeId });
  };

  const handleToggleMade = async (recipeId: string, currentMade: boolean) => {
    // Optimistically update UI
    setRecipes((prev) =>
      prev.map((r) =>
        r.recipe.id === recipeId ? { ...r, made: !currentMade } : r
      )
    );
    await toggleMade({ weekId, recipeId, made: !currentMade });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = recipes.findIndex((item) => item.recipe.id === active.id);
    const newIndex = recipes.findIndex((item) => item.recipe.id === over.id);

    const newOrder = arrayMove(recipes, oldIndex, newIndex);

    // Update local state immediately
    setRecipes(newOrder);

    // Update server with new order
    reorderRecipes({
      weekId,
      recipeIds: newOrder.map((item) => item.recipe.id),
    });
  };

  const handleRecipeAdded = () => {
    router.refresh();
  };

  // Separate recipes into made and unmade
  const unmadeRecipes = recipes.filter((r) => !r.made);
  const madeRecipes = recipes.filter((r) => r.made);

  const content =
    recipes.length === 0 ? (
      <div className="p-6 text-center text-mystic-700 dark:text-cream-200">
        No recipes added to this week yet.
      </div>
    ) : !isMounted ? (
      // Show non-interactive list during SSR
      <div className="space-y-4">
        {unmadeRecipes.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-mystic-700 dark:text-cream-200">
              Upcoming Recipes ({unmadeRecipes.length})
            </h4>
            <div className="space-y-2">
              {unmadeRecipes.map(({ recipe }) => {
                const hasRelated = (recipe as any).relatedRecipes && (recipe as any).relatedRecipes.length > 0;
                return (
                  <StaticRecipeItem
                    key={recipe.id}
                    recipe={recipe}
                    hasRelated={hasRelated}
                  />
                );
              })}
            </div>
          </div>
        )}
        {madeRecipes.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-mystic-700 dark:text-cream-200">
              Made Recipes ({madeRecipes.length})
            </h4>
            <div className="space-y-2">
              {madeRecipes.map(({ recipe }) => {
                const hasRelated = (recipe as any).relatedRecipes && (recipe as any).relatedRecipes.length > 0;
                return (
                  <StaticRecipeItem
                    key={recipe.id}
                    recipe={recipe}
                    hasRelated={hasRelated}
                    isMade
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="space-y-4">
        {/* Unmade Recipes Section */}
        {unmadeRecipes.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-mystic-700 dark:text-cream-200">
              Upcoming Recipes ({unmadeRecipes.length})
            </h4>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={unmadeRecipes.map((r) => r.recipe.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {unmadeRecipes.map((weekRecipe) => (
                    <SortableRecipeItem
                      key={weekRecipe.recipe.id}
                      weekRecipe={weekRecipe}
                      onRemove={handleRemoveRecipe}
                      onToggleMade={handleToggleMade}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Made Recipes Section - Collapsible */}
        {madeRecipes.length > 0 && (
          <div>
            <button
              onClick={() => setShowMade(!showMade)}
              className="flex items-center gap-2 text-sm font-medium mb-2 text-mystic-700 dark:text-cream-200 hover:text-mystic-900 dark:hover:text-cream-100 transition-colors"
            >
              {showMade ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Made Recipes ({madeRecipes.length})
            </button>
            {showMade && (
              <div className="space-y-2">
                {madeRecipes.map((weekRecipe) => (
                  <SortableRecipeItem
                    key={weekRecipe.recipe.id}
                    weekRecipe={weekRecipe}
                    onRemove={handleRemoveRecipe}
                    onToggleMade={handleToggleMade}
                    isMade
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );

  if (embedded) {
    return (
      <>
        <div className="mt-4">{content}</div>
        <AddRecipeDialog
          weekId={weekId}
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onRecipeAdded={handleRecipeAdded}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Week Recipes
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2 dark:text-cream-200" />
              Add Recipe
            </Button>
          </div>
          {content}
        </CardContent>
      </Card>
      <AddRecipeDialog
        weekId={weekId}
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onRecipeAdded={handleRecipeAdded}
      />
    </>
  );
}

const relationTypeLabels: Record<string, string> = {
  [RELATION_TYPES.SIDE]: "Side",
  [RELATION_TYPES.BASE]: "Base",
  [RELATION_TYPES.SAUCE]: "Sauce",
  [RELATION_TYPES.TOPPING]: "Topping",
  [RELATION_TYPES.DESSERT]: "Dessert",
  [RELATION_TYPES.CUSTOM]: "Related",
};

function StaticRecipeItem({
  recipe,
  hasRelated,
  isMade = false,
}: {
  recipe: Recipe & { relatedRecipes?: any[] };
  hasRelated: boolean;
  isMade?: boolean;
}) {
  const [showRelated, setShowRelated] = useState(false);

  return (
    <div>
      <Link href={`/recipes/${recipe.id}`}>
        <div className={`flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-mystic-50 dark:hover:bg-cream-200/10 transition-colors ${isMade ? 'opacity-60' : ''}`}>
          <div className="text-xl">{recipe.emoji || "🍽️"}</div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium truncate text-mystic-900 dark:text-cream-100 ${isMade ? 'line-through' : ''}`}>
              {recipe.name}
            </div>
            {hasRelated && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowRelated(!showRelated);
                }}
                className="text-[10px] text-mystic-600 dark:text-cream-100 hover:text-mystic-900 dark:hover:text-cream-50 flex items-center gap-1 mt-0.5"
              >
                {showRelated ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {recipe.relatedRecipes!.length} related recipe{recipe.relatedRecipes!.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {recipe.mealType && (
              <Badge variant="secondary" className="text-xs">
                {recipe.mealType}
              </Badge>
            )}
            {recipe.difficulty && (
              <Badge variant="outline" className="text-xs">
                {recipe.difficulty}
              </Badge>
            )}
          </div>
        </div>
      </Link>
      {hasRelated && showRelated && (
        <div className="ml-12 mt-1 space-y-1">
          {recipe.relatedRecipes!.map((relatedRecipe: any) => (
            <Link
              key={relatedRecipe.id}
              href={`/recipes/${relatedRecipe.id}`}
              className="flex items-center gap-2 p-2 rounded-md bg-mystic-50/50 dark:bg-cream-200/5 border border-mystic-200/50 dark:border-cream-200/10 hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors"
            >
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                {relationTypeLabels[relatedRecipe.relationType] || "Related"}
              </Badge>
              <div className="text-sm opacity-60">{relatedRecipe.emoji || "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-mystic-800 dark:text-cream-100">
                  {relatedRecipe.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableRecipeItem({
  weekRecipe,
  onRemove,
  onToggleMade,
  isMade = false,
}: {
  weekRecipe: WeekRecipe & { recipe: Recipe & { relatedRecipes?: any[] } };
  onRemove: (recipeId: string) => void;
  onToggleMade: (recipeId: string, currentMade: boolean) => void;
  isMade?: boolean;
}) {
  const { recipe } = weekRecipe;
  const [showRelated, setShowRelated] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recipe.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isMade ? 0.6 : 1,
  };

  const hasRelatedRecipes = recipe.relatedRecipes && recipe.relatedRecipes.length > 0;

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-mystic-50 dark:hover:bg-cream-200/10 transition-colors group">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-5 w-5 text-mystic-600 dark:text-cream-200" />
        </div>
        <Checkbox
          checked={weekRecipe.made}
          onCheckedChange={() => onToggleMade(recipe.id, weekRecipe.made)}
          className="flex-shrink-0"
        />
        <Link
          href={`/recipes/${recipe.id}`}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <div className="text-xl">{recipe.emoji || "🍽️"}</div>
          <div className="flex-1 min-w-0">
            <div
              className={`text-sm font-medium truncate text-mystic-900 dark:text-cream-100 ${
                isMade ? "line-through" : ""
              }`}
            >
              {recipe.name}
            </div>
            {hasRelatedRecipes && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setShowRelated(!showRelated);
                }}
                className="text-[10px] text-mystic-600 dark:text-cream-100 hover:text-mystic-900 dark:hover:text-cream-50 flex items-center gap-1 mt-0.5"
              >
                {showRelated ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {recipe.relatedRecipes!.length} related recipe{recipe.relatedRecipes!.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {recipe.mealType && (
              <Badge variant="secondary" className="text-xs">
                {recipe.mealType}
              </Badge>
            )}
            {recipe.difficulty && (
              <Badge variant="outline" className="text-xs">
                {recipe.difficulty}
              </Badge>
            )}
          </div>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            onRemove(recipe.id);
          }}
          className="md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-4 w-4 dark:text-cream-300" />
        </Button>
      </div>

      {/* Related Recipes - collapsible nested below main recipe */}
      {hasRelatedRecipes && showRelated && (
        <div className="ml-12 mt-1 space-y-1">
          {recipe.relatedRecipes!.map((relatedRecipe: any) => (
            <Link
              key={relatedRecipe.id}
              href={`/recipes/${relatedRecipe.id}`}
              className="flex items-center gap-2 p-2 rounded-md bg-mystic-50/50 dark:bg-cream-200/5 border border-mystic-200/50 dark:border-cream-200/10 hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors group/related"
            >
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                {relationTypeLabels[relatedRecipe.relationType] || "Related"}
              </Badge>
              <div className="text-sm opacity-60">{relatedRecipe.emoji || "🍽️"}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate text-mystic-800 dark:text-cream-100">
                  {relatedRecipe.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
