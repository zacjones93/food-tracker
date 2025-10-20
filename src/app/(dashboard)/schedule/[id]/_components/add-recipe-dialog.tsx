"use client";

import { useState, useEffect, useCallback } from "react";
import { useServerAction } from "zsa-react";
import { getRecipesAction } from "@/app/(dashboard)/recipes/recipes.actions";
import { addRecipeToWeekAction } from "../../weeks.actions";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "@/components/ui/themed-icons";

interface AddRecipeDialogProps {
  weekId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecipeAdded?: () => void;
}

export function AddRecipeDialog({
  weekId,
  open,
  onOpenChange,
  onRecipeAdded,
}: AddRecipeDialogProps) {
  const [search, setSearch] = useState("");

  const { execute: fetchRecipes, data, isPending } = useServerAction(getRecipesAction);
  const { execute: addRecipe, isPending: isAdding } = useServerAction(addRecipeToWeekAction, {
    onSuccess: () => {
      toast.success("Recipe added to week");
      onOpenChange(false);
      setSearch("");
      onRecipeAdded?.();
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to add recipe");
    },
  });

  // Fetch recipes when dialog opens or search changes
  useEffect(() => {
    if (open) {
      fetchRecipes({
        search: search || undefined,
        page: 1,
        limit: 50,
      });
    }
  }, [open, search, fetchRecipes]);

  const handleSelect = useCallback(
    (recipeId: string) => {
      addRecipe({ weekId, recipeId });
    },
    [weekId, addRecipe]
  );

  const recipes = data?.recipes || [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Add Recipe to Week">
      <CommandInput
        placeholder="Search recipes..."
        value={search}
        onValueChange={setSearch}
        disabled={isAdding}
      />
      <CommandList className="h-[400px] overflow-y-auto">
        {isPending ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin dark:text-cream-200" />
          </div>
        ) : (
          <>
            <CommandEmpty>No recipes found.</CommandEmpty>
            <CommandGroup heading="Recipes">
              {recipes.map((recipe) => (
                <CommandItem
                  key={recipe.id}
                  value={recipe.name}
                  onSelect={() => handleSelect(recipe.id)}
                  disabled={isAdding}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-xl">{recipe.emoji || '🍽️'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{recipe.name}</div>
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
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
