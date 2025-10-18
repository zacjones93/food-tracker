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
import { CalendarPlus, Loader2, Check } from "lucide-react";
import { useServerAction } from "zsa-react";
import { getWeeksForRecipeAction, addRecipeToWeekAction } from "@/app/(dashboard)/schedule/weeks.actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface AddToScheduleProps {
  recipeId: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function AddToSchedule({
  recipeId,
  variant = "outline",
  size = "sm",
  showLabel = true
}: AddToScheduleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute: getWeeks, data: weeksData, isPending: isLoadingWeeks } = useServerAction(getWeeksForRecipeAction);
  const { execute: addRecipe, isPending: isAdding } = useServerAction(addRecipeToWeekAction);

  useEffect(() => {
    if (open) {
      getWeeks({ recipeId });
    }
  }, [open, getWeeks, recipeId]);

  const handleAddToWeek = async (weekId: string, weekName: string) => {
    const [, error] = await addRecipe({ weekId, recipeId });

    if (error) {
      if (error.code === "CONFLICT") {
        toast.error("Recipe is already in this week");
      } else {
        toast.error("Failed to add recipe to week");
      }
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
          variant={variant}
          size={size}
          className={showLabel ? "gap-2" : ""}
        >
          <CalendarPlus className="h-4 w-4" />
          {showLabel && "Add to Schedule"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Add to Week</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoadingWeeks ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : weeks.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No current or upcoming weeks
          </div>
        ) : (
          weeks.map((week) => (
            <DropdownMenuItem
              key={week.id}
              onClick={() => !week.hasRecipe && handleAddToWeek(week.id, week.name)}
              disabled={isAdding || week.hasRecipe}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 w-full">
                {week.emoji && <span>{week.emoji}</span>}
                <span className={week.hasRecipe ? "text-muted-foreground" : ""}>{week.name}</span>
                <div className="ml-auto flex items-center gap-2">
                  {week.status === 'current' && (
                    <span className="text-xs text-primary">Current</span>
                  )}
                  {week.hasRecipe && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
