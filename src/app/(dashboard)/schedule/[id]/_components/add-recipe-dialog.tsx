"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { format, eachDayOfInterval, parseISO } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddRecipeDialogProps {
  weekId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecipeAdded?: () => void;
  weekStartDate?: Date | null;
  weekEndDate?: Date | null;
}

export function AddRecipeDialog({
  weekId,
  open,
  onOpenChange,
  onRecipeAdded,
  weekStartDate,
  weekEndDate,
}: AddRecipeDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<string>("unscheduled");

  // Generate weekdays based on startDate and endDate
  const weekdays = useMemo(() => {
    if (!weekStartDate || !weekEndDate) return [];

    try {
      const start = weekStartDate instanceof Date ? weekStartDate : parseISO(weekStartDate as unknown as string);
      const end = weekEndDate instanceof Date ? weekEndDate : parseISO(weekEndDate as unknown as string);

      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [weekStartDate, weekEndDate]);

  const { execute: fetchRecipes, data, isPending } = useServerAction(getRecipesAction);
  const { execute: addRecipe, isPending: isAdding } = useServerAction(addRecipeToWeekAction, {
    onSuccess: () => {
      toast.success("Recipe added to week");
      onOpenChange(false);
      setSearch("");
      setSelectedDay("unscheduled");
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
        sortBy: "newest",
      });
    }
  }, [open, search, fetchRecipes]);

  const handleSelect = useCallback(
    (recipeId: string) => {
      // Convert selectedDay to Date or undefined
      const scheduledDate = selectedDay === "unscheduled"
        ? undefined
        : weekdays.find(d => format(d, 'yyyy-MM-dd') === selectedDay);

      addRecipe({
        weekId,
        recipeId,
        scheduledDate
      });
    },
    [weekId, addRecipe, selectedDay, weekdays]
  );

  const recipes = data?.recipes || [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Add Recipe to Week">
      {weekdays.length > 0 && (
        <div className="p-3 border-b">
          <label className="text-sm font-medium mb-2 block text-mystic-900 dark:text-cream-100">
            Schedule for:
          </label>
          <Select
            value={selectedDay}
            onValueChange={setSelectedDay}
            disabled={isAdding}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unscheduled">Unscheduled</SelectItem>
              {weekdays.map((day) => (
                <SelectItem key={format(day, 'yyyy-MM-dd')} value={format(day, 'yyyy-MM-dd')}>
                  {format(day, 'EEEE, MMM d')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <CommandInput
        placeholder="Search recipes..."
        value={search}
        onValueChange={setSearch}
        disabled={isAdding}
      />
      <CommandList className="h-[500px] overflow-y-auto">
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
