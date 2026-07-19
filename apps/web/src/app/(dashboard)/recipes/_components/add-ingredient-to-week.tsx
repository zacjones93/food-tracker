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

interface AddIngredientToWeekProps {
  ingredient: string;
}

export function AddIngredientToWeek({ ingredient }: AddIngredientToWeekProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute: getWeeks, data: weeksData, isPending: isLoadingWeeks } = useServerAction(getCurrentAndUpcomingWeeksAction);
  const { execute: addIngredient, isPending: isAdding } = useServerAction(createGroceryItemAction);

  useEffect(() => {
    if (open) {
      getWeeks();
    }
  }, [open, getWeeks]);

  const handleAddToWeek = async (weekId: string, weekName: string) => {
    const [, error] = await addIngredient({ weekId, name: ingredient });

    if (error) {
      toast.error("Failed to add ingredient to grocery list");
    } else {
      toast.success(`Added to ${weekName}`);
      setOpen(false);
      router.refresh();
    }
  };

  const weeks = weeksData?.weeks || [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
        >
          <Plus className="h-3 w-3 text-cream-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Add to Grocery List</DropdownMenuLabel>
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
              onClick={() => handleAddToWeek(week.id, week.name)}
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
