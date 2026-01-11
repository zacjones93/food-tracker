"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useServerAction } from "zsa-react";
import {
  getRecipesAction,
  getRecipeMetadataAction,
} from "@/app/(dashboard)/recipes/recipes.actions";
import { addRecipeToWeekAction } from "../../weeks.actions";
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

interface BrowseRecipesByTagProps {
  weekId: string;
  scheduledDate: Date;
  onRecipeAdded?: () => void;
}

export function BrowseRecipesByTag({
  weekId,
  scheduledDate,
  onRecipeAdded,
}: BrowseRecipesByTagProps) {
  const [open, setOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");

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
  const { execute: addRecipe, isPending: isAdding } = useServerAction(
    addRecipeToWeekAction,
    {
      onSuccess: () => {
        toast.success("Recipe added");
        setOpen(false);
        setSelectedTag(null);
        setTagSearch("");
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
    (recipeId: string) => {
      addRecipe({
        weekId,
        recipeId,
        scheduledDate,
      });
    },
    [weekId, addRecipe, scheduledDate]
  );

  const handleBack = () => {
    setSelectedTag(null);
  };

  const tags = metadataData?.tags || [];
  const recipes = recipesData?.recipes || [];

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return tags;
    const search = tagSearch.toLowerCase();
    return tags.filter((tag) => tag.toLowerCase().includes(search));
  }, [tags, tagSearch]);

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
            {selectedTag && (
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
            {selectedTag ? `${selectedTag}` : "Browse by Tag"}
          </DialogTitle>
        </DialogHeader>

        {/* Search input for tags */}
        {!selectedTag && (
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
          {!selectedTag ? (
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
                    onClick={() => handleSelectRecipe(recipe.id)}
                    disabled={isAdding}
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
                    {isAdding && (
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
