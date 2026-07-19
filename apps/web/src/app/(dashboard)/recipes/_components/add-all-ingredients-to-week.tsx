"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Loader2 } from "@/components/ui/themed-icons";
import { useServerAction } from "zsa-react";
import { getCurrentAndUpcomingWeeksAction } from "@/app/(dashboard)/schedule/weeks.actions";
import { createGroceryItemAction } from "@/app/(dashboard)/schedule/grocery-items.actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface AddAllIngredientsToWeekProps {
  ingredients: string[];
}

export function AddAllIngredientsToWeek({ ingredients }: AddAllIngredientsToWeekProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute: getWeeks, data: weeksData, isPending: isLoadingWeeks } = useServerAction(getCurrentAndUpcomingWeeksAction);
  const { execute: addIngredient, isPending: isAdding } = useServerAction(createGroceryItemAction);

  useEffect(() => {
    if (open) {
      getWeeks();
    }
  }, [open, getWeeks]);

  const handleAddAllToWeek = async (weekId: string, weekName: string) => {
    let successCount = 0;
    let errorCount = 0;

    for (const ingredient of ingredients) {
      const [, error] = await addIngredient({ weekId, name: ingredient });

      if (error) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    if (errorCount > 0) {
      toast.error(`Failed to add ${errorCount} ingredient${errorCount > 1 ? 's' : ''}`);
    }

    if (successCount > 0) {
      toast.success(`Added ${successCount} ingredient${successCount > 1 ? 's' : ''} to ${weekName}`);
    }

    setOpen(false);
    router.refresh();
  };

  const weeks = weeksData?.weeks || [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Plus className="h-4 w-4 text-cream-100" />
          Add All
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Add All to Grocery List</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoadingWeeks ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-cream-100" />
          </div>
        ) : weeks.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No current or upcoming weeks
          </div>
        ) : (
          weeks.map((week) => (
            <DropdownMenuItem
              key={week.id}
              onClick={() => handleAddAllToWeek(week.id, week.name)}
              disabled={isAdding}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 w-full">
                {week.emoji && <span>{week.emoji}</span>}
                <span>{week.name}</span>
                {week.status === 'current' && (
                  <span className="ml-auto text-xs text-mystic-600 dark:text-cream-200">Current</span>
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
