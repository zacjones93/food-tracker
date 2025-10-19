"use client";

import { useState, useEffect } from "react";
import { type Recipe, type WeekRecipe } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { GripVertical, Trash2, Plus } from "lucide-react";
import { useServerAction } from "zsa-react";
import { reorderWeekRecipesAction, removeRecipeFromWeekAction } from "../../weeks.actions";
import { toast } from "sonner";
import { AddRecipeDialog } from "./add-recipe-dialog";
import { useRouter } from "next/navigation";

interface WeekRecipesListProps {
  weekId: string;
  recipes: (WeekRecipe & { recipe: Recipe })[];
  embedded?: boolean;
}

export function WeekRecipesList({ weekId, recipes: initialRecipes, embedded = false }: WeekRecipesListProps) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [isMounted, setIsMounted] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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

  const { execute: reorderRecipes } = useServerAction(reorderWeekRecipesAction, {
    onError: ({ err }) => {
      toast.error(err.message || "Failed to reorder recipes");
      setRecipes(initialRecipes);
    },
  });

  const { execute: removeRecipe } = useServerAction(removeRecipeFromWeekAction, {
    onSuccess: () => {
      toast.success("Recipe removed from week");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to remove recipe");
    },
  });

  const handleRemoveRecipe = async (recipeId: string) => {
    // Optimistically update UI
    setRecipes(prev => prev.filter(r => r.recipe.id !== recipeId));
    await removeRecipe({ weekId, recipeId });
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

  const content = recipes.length === 0 ? (
    <div className="p-6 text-center text-muted-foreground">
      No recipes added to this week yet.
    </div>
  ) : !isMounted ? (
    // Show non-interactive list during SSR
    <div className="space-y-2">
      {recipes.map(({ recipe }) => (
        <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-muted/50 transition-colors">
            <div className="text-2xl">{recipe.emoji || '🍽️'}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{recipe.name}</h3>
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
      ))}
    </div>
  ) : (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={recipes.map((r) => r.recipe.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {recipes.map(({ recipe }) => (
            <SortableRecipeItem
              key={recipe.id}
              recipe={recipe}
              onRemove={handleRemoveRecipe}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
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
            <h3 className="text-sm font-medium text-muted-foreground">Week Recipes</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
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

function SortableRecipeItem({ recipe, onRemove }: { recipe: Recipe; onRemove: (recipeId: string) => void }) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-muted/50 transition-colors group"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
      <Link href={`/recipes/${recipe.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-2xl">{recipe.emoji || '🍽️'}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{recipe.name}</h3>
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
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
