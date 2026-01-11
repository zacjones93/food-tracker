"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useServerAction } from "zsa-react";
import { getRecipesAction, getRecipeMetadataAction } from "@/app/(dashboard)/recipes/recipes.actions";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, SlidersHorizontal, X, ChevronRight } from "@/components/ui/themed-icons";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<string>("unscheduled");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

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
  const { execute: fetchMetadata, data: metadataData, isPending: isLoadingTags } = useServerAction(getRecipeMetadataAction);
  const { execute: addRecipe, isPending: isAdding } = useServerAction(addRecipeToWeekAction, {
    onSuccess: () => {
      toast.success("Recipe added to week");
      onOpenChange(false);
      setSearch("");
      setSelectedDay("unscheduled");
      setSelectedTag(null);
      setTagSearch("");
      onRecipeAdded?.();
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to add recipe");
    },
  });

  // Fetch tags when popover opens
  useEffect(() => {
    if (tagPopoverOpen && !metadataData) {
      fetchMetadata();
    }
  }, [tagPopoverOpen, metadataData, fetchMetadata]);

  // Fetch recipes when dialog opens, search changes, or tag filter changes
  useEffect(() => {
    if (open) {
      fetchRecipes({
        search: search || undefined,
        tags: selectedTag ? [selectedTag] : undefined,
        page: 1,
        limit: 50,
        sortBy: "newest",
      });
    }
  }, [open, search, selectedTag, fetchRecipes]);

  const tags = metadataData?.tags || [];
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return tags;
    const searchLower = tagSearch.toLowerCase();
    return tags.filter((tag) => tag.toLowerCase().includes(searchLower));
  }, [tags, tagSearch]);

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

  const handleCreateRecipe = useCallback(() => {
    const callbackUrl = encodeURIComponent(pathname);
    router.push(`/recipes/create?callback=${callbackUrl}`);
    onOpenChange(false);
  }, [router, pathname, onOpenChange]);

  const recipes = data?.recipes || [];
  const hasNoResults = !isPending && recipes.length === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Add Recipe to Week">
      <div className="p-3 border-b space-y-3">
        {weekdays.length > 0 && (
          <div>
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

        {/* Tag filter */}
        <div className="flex items-center gap-2">
          <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen} modal={true}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter by tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 z-[100]" align="start">
              <div className="p-2 border-b">
                <Input
                  placeholder="Search tags..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <ScrollArea className="h-[200px]">
                {isLoadingTags ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : filteredTags.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    {tagSearch ? "No matching tags" : "No tags"}
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setSelectedTag(tag);
                          setTagPopoverOpen(false);
                          setTagSearch("");
                        }}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors text-left"
                      >
                        <span>{tag}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {selectedTag && (
            <Badge variant="secondary" className="gap-1 pr-1">
              {selectedTag}
              <button
                onClick={() => setSelectedTag(null)}
                className="ml-1 hover:bg-mystic-300 dark:hover:bg-cream-200/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      </div>

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
            {hasNoResults ? (
              <div className="p-4 text-sm text-muted-foreground">
                <CommandEmpty>No recipes found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreateRecipe}
                    className="cursor-pointer"
                  >
                    <Plus className="mr-2 h-4 w-4 text-cream-100" />
                    <span>Create new recipe</span>
                  </CommandItem>
                </CommandGroup>
              </div>
            ) : (
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
            )}
          </>
        )}
      </CommandList>
      <div className="border-t p-3 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateRecipe}
          disabled={isAdding}
        >
          <Plus className="mr-2 h-4 w-4 text-cream-100" />
          Create Recipe
        </Button>
      </div>
    </CommandDialog>
  );
}
