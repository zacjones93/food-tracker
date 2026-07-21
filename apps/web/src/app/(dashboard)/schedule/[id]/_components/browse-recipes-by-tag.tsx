"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useServerAction } from "zsa-react";
import {
  getRecipesAction,
  getRecipeMetadataAction,
} from "@/app/(dashboard)/recipes/recipes.actions";
import {
  addRecipeToWeekAction,
  getSchedulePreparationOptionsAction,
} from "../../weeks.actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ChevronLeft, Search, ChevronRight } from "@/components/ui/themed-icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { format, subDays } from "date-fns";

interface BrowseRecipesByTagProps {
  weekId: string;
  scheduledDate: Date;
  onRecipeAdded?: () => void;
}

interface SelectedRecipe {
  id: string;
  name: string;
  emoji: string | null;
}

interface PreparationSelection {
  recipeRelationId: string;
  recipeId: string;
  name: string;
  emoji: string | null;
  scheduleLeadDays: number;
  included: boolean;
  scheduledDay: string;
}

export function BrowseRecipesByTag({
  weekId,
  scheduledDate,
  onRecipeAdded,
}: BrowseRecipesByTagProps) {
  const [open, setOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<SelectedRecipe | null>(null);
  const [preparations, setPreparations] = useState<PreparationSelection[]>([]);

  const {
    execute: fetchMetadata,
    data: metadataData,
    isPending: isLoadingTags,
  } = useServerAction(getRecipeMetadataAction);
  const {
    execute: fetchRecipes,
    data: recipesData,
    isPending: isLoadingRecipes,
  } = useServerAction(getRecipesAction);
  const { execute: fetchPreparationOptions, isPending: isLoadingPreparations } =
    useServerAction(getSchedulePreparationOptionsAction);
  const { execute: addRecipe, isPending: isAdding } = useServerAction(
    addRecipeToWeekAction,
    {
      onSuccess: () => {
        toast.success("Recipe added");
        setOpen(false);
        setSelectedTag(null);
        setTagSearch("");
        setSelectedRecipe(null);
        setPreparations([]);
        onRecipeAdded?.();
      },
      onError: ({ err }) => {
        toast.error(err.message || "Failed to add recipe");
      },
    }
  );

  // Fetch tags when dialog opens
  useEffect(() => {
    if (open && !metadataData) {
      fetchMetadata();
    }
  }, [open, metadataData, fetchMetadata]);

  // Fetch recipes when tag is selected
  useEffect(() => {
    if (selectedTag) {
      fetchRecipes({
        tags: [selectedTag],
        page: 1,
        limit: 50,
        sortBy: "name",
      });
    }
  }, [selectedTag, fetchRecipes]);

  const handleSelectRecipe = useCallback(
    async (recipe: SelectedRecipe) => {
      const [preparationData, preparationError] = await fetchPreparationOptions({
        recipeId: recipe.id,
      });
      if (preparationError) {
        toast.error(preparationError.message || "Failed to load preparation recipes");
        return;
      }

      const preparationOptions = preparationData?.preparations ?? [];
      if (preparationOptions.length === 0) {
        await addRecipe({ weekId, recipeId: recipe.id, scheduledDate });
        return;
      }

      setSelectedRecipe(recipe);
      setPreparations(
        preparationOptions.map((preparation) => ({
          ...preparation,
          included: true,
          scheduledDay: format(
            subDays(scheduledDate, preparation.scheduleLeadDays),
            "yyyy-MM-dd",
          ),
        })),
      );
    },
    [addRecipe, fetchPreparationOptions, scheduledDate, weekId],
  );

  const handleConfirmSchedule = useCallback(async () => {
    if (!selectedRecipe) return;
    await addRecipe({
      weekId,
      recipeId: selectedRecipe.id,
      scheduledDate,
      preparations: preparations
        .filter((preparation) => preparation.included)
        .map((preparation) => ({
          recipeRelationId: preparation.recipeRelationId,
          recipeId: preparation.recipeId,
          scheduledDate: new Date(`${preparation.scheduledDay}T12:00:00`),
        })),
    });
  }, [addRecipe, preparations, scheduledDate, selectedRecipe, weekId]);

  const handleBack = () => {
    if (selectedRecipe) {
      setSelectedRecipe(null);
      setPreparations([]);
      return;
    }
    setSelectedTag(null);
  };

  const recipes = recipesData?.recipes || [];

  // Filter tags by search
  const filteredTags = useMemo(() => {
    const tags = metadataData?.tags ?? [];
    if (!tagSearch.trim()) return tags;
    const search = tagSearch.toLowerCase();
    return tags.filter((tag) => tag.toLowerCase().includes(search));
  }, [metadataData?.tags, tagSearch]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1">
          <Search className="h-3 w-3" />
          Browse
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(selectedTag || selectedRecipe) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-8 w-8 p-0"
                disabled={isAdding}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {selectedRecipe ? `Schedule ${selectedRecipe.name}` : selectedTag ? `${selectedTag}` : "Browse by Tag"}
          </DialogTitle>
        </DialogHeader>

        {/* Search input for tags */}
        {!selectedTag && !selectedRecipe && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        <ScrollArea className="h-[350px]">
          {selectedRecipe ? (
            <div className="space-y-3 pr-3">
              <p className="text-sm text-muted-foreground">
                Choose which preparation recipes to schedule before {selectedRecipe.name}.
              </p>
              {preparations.map((preparation) => (
                <div key={preparation.recipeRelationId} className="space-y-3 rounded-lg border p-3">
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={preparation.included}
                      onCheckedChange={(checked) => {
                        setPreparations((current) => current.map((item) =>
                          item.recipeRelationId === preparation.recipeRelationId
                            ? { ...item, included: checked === true }
                            : item,
                        ));
                      }}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {preparation.emoji || "🍽️"} {preparation.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Suggested {preparation.scheduleLeadDays} day{preparation.scheduleLeadDays === 1 ? "" : "s"} before
                      </span>
                    </span>
                  </label>
                  {preparation.included ? (
                    <Input
                      type="date"
                      value={preparation.scheduledDay}
                      onChange={(event) => {
                        setPreparations((current) => current.map((item) =>
                          item.recipeRelationId === preparation.recipeRelationId
                            ? { ...item, scheduledDay: event.target.value }
                            : item,
                        ));
                      }}
                      className="ml-7 w-[calc(100%-1.75rem)]"
                    />
                  ) : null}
                </div>
              ))}
              <Button className="w-full" onClick={handleConfirmSchedule} disabled={isAdding}>
                {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Add to schedule
              </Button>
            </div>
          ) : !selectedTag ? (
            // Tag selection view - rows with search
            isLoadingTags ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tagSearch ? "No matching tags" : "No tags found"}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-mystic-100 dark:hover:bg-cream-200/10 transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-mystic-900 dark:text-cream-100">
                      {tag}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )
          ) : (
            // Recipe list view for selected tag
            isLoadingRecipes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : recipes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No recipes with this tag
              </div>
            ) : (
              <div className="space-y-2">
                {recipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => handleSelectRecipe({
                      id: recipe.id,
                      name: recipe.name,
                      emoji: recipe.emoji,
                    })}
                    disabled={isAdding || isLoadingPreparations}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-background border hover:bg-mystic-50 dark:hover:bg-cream-200/10 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="text-xl">{recipe.emoji || "🍽️"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-mystic-900 dark:text-cream-100">
                        {recipe.name}
                      </div>
                      {recipe.mealType && (
                        <div className="text-xs text-muted-foreground">
                          {recipe.mealType}
                        </div>
                      )}
                    </div>
                    {(isAdding || isLoadingPreparations) && (
                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
