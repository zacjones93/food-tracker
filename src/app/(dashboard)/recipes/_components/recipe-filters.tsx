"use client";

import {
  useQueryStates,
  parseAsString,
  parseAsInteger,
  parseAsArrayOf,
} from "nuqs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useCallback } from "react";
import { getRecipeBooksAction } from "../../recipe-books/recipe-books.actions";
import { useServerAction } from "zsa-react";

export function RecipeFilters() {
  const [filters, setFilters] = useQueryStates(
    {
      mealType: parseAsString,
      difficulty: parseAsString,
      seasons: parseAsArrayOf(parseAsString),
      minMealsEaten: parseAsInteger,
      maxMealsEaten: parseAsInteger,
      recipeBookId: parseAsString,
      sortBy: parseAsString,
      page: parseAsInteger,
    },
    {
      history: "push",
    }
  );

  const SEASONAL_TAGS = ["Spring", "Summer", "Fall", "Winter"];

  const { execute: fetchRecipeBooks, data: recipeBooksData } =
    useServerAction(getRecipeBooksAction);

  useEffect(() => {
    fetchRecipeBooks({ page: 1, limit: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recipeBooks = recipeBooksData?.recipeBooks || [];

  const handleClearFilters = () => {
    setFilters({
      mealType: null,
      difficulty: null,
      seasons: null,
      minMealsEaten: null,
      maxMealsEaten: null,
      recipeBookId: null,
      sortBy: null,
      page: 1,
    });
  };

  // Reset to page 1 when any filter changes (except search, which is handled above)
  const handleFilterChange = useCallback(
    (updates: Record<string, string | number | string[] | null>) => {
      setFilters({ ...updates, page: 1 });
    },
    [setFilters]
  );

  const handleSeasonToggle = (season: string) => {
    const currentSeasons = filters.seasons || [];
    const newSeasons = currentSeasons.includes(season)
      ? currentSeasons.filter((s) => s !== season)
      : [...currentSeasons, season];

    handleFilterChange({
      seasons: newSeasons.length > 0 ? newSeasons : null,
    });
  };

  const hasActiveFilters =
    filters.mealType ||
    filters.difficulty ||
    (filters.seasons && filters.seasons.length > 0) ||
    filters.minMealsEaten !== null ||
    filters.maxMealsEaten !== null ||
    filters.recipeBookId;

  const activeFilterCount =
    [
      filters.mealType,
      filters.difficulty,
      filters.recipeBookId,
      filters.minMealsEaten !== null,
      filters.maxMealsEaten !== null,
    ].filter(Boolean).length + (filters.seasons?.length || 0);

  const FilterFields = () => (
    <>
      {/* Sort By */}
      <div className="space-y-2">
        <Label htmlFor="sortBy">Sort By</Label>
        <Select
          value={filters.sortBy || "newest"}
          onValueChange={(value) =>
            handleFilterChange({ sortBy: value === "newest" ? null : value })
          }
        >
          <SelectTrigger id="sortBy">
            <SelectValue placeholder="Newest" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="mostEaten">Most Eaten</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Recipe Book */}
      <div className="space-y-2">
        <Label htmlFor="recipeBook">Recipe Book</Label>
        <Select
          value={filters.recipeBookId || "all"}
          onValueChange={(value) =>
            handleFilterChange({ recipeBookId: value === "all" ? null : value })
          }
        >
          <SelectTrigger id="recipeBook">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {recipeBooks.map((book) => (
              <SelectItem key={book.id} value={book.id}>
                {book.name} ({book.recipeCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Meal Type */}
      <div className="space-y-2">
        <Label htmlFor="mealType">Meal Type</Label>
        <Select
          value={filters.mealType || "all"}
          onValueChange={(value) =>
            handleFilterChange({ mealType: value === "all" ? null : value })
          }
        >
          <SelectTrigger id="mealType">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Breakfast">Breakfast</SelectItem>
            <SelectItem value="Lunch">Lunch</SelectItem>
            <SelectItem value="Dinner">Dinner</SelectItem>
            <SelectItem value="Snack">Snack</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Difficulty */}
      <div className="space-y-2">
        <Label htmlFor="difficulty">Difficulty</Label>
        <Select
          value={filters.difficulty || "all"}
          onValueChange={(value) =>
            handleFilterChange({ difficulty: value === "all" ? null : value })
          }
        >
          <SelectTrigger id="difficulty">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Easy">Easy</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Seasons (Multi-select) */}
      <div className="space-y-2">
        <Label htmlFor="seasons">Seasons</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="seasons"
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
            >
              {filters.seasons && filters.seasons.length > 0
                ? `${filters.seasons.length} selected`
                : "All seasons"}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <div className="p-2 space-y-2">
              {SEASONAL_TAGS.map((season) => (
                <div key={season} className="flex items-center space-x-2">
                  <Checkbox
                    id={`season-${season}`}
                    checked={filters.seasons?.includes(season) || false}
                    onCheckedChange={() => handleSeasonToggle(season)}
                  />
                  <label
                    htmlFor={`season-${season}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {season}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Min Meals Eaten */}
      <div className="space-y-2">
        <Label htmlFor="minMealsEaten">Min Times Made</Label>
        <Input
          id="minMealsEaten"
          type="number"
          min="0"
          placeholder="Min"
          value={filters.minMealsEaten ?? ""}
          onChange={(e) =>
            handleFilterChange({
              minMealsEaten: e.target.value ? parseInt(e.target.value) : null,
            })
          }
        />
      </div>

      {/* Max Meals Eaten */}
      <div className="space-y-2">
        <Label htmlFor="maxMealsEaten">Max Times Made</Label>
        <Input
          id="maxMealsEaten"
          type="number"
          min="0"
          placeholder="Max"
          value={filters.maxMealsEaten ?? ""}
          onChange={(e) =>
            handleFilterChange({
              maxMealsEaten: e.target.value ? parseInt(e.target.value) : null,
            })
          }
        />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile: Sheet with filter button */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader>
              <SheetTitle>Filter Recipes</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4 overflow-y-auto h-[calc(100%-80px)]">
              <FilterFields />
              {hasActiveFilters && (
                <div className="pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Card with all filters */}
      <Card className="p-4 hidden md:block">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <FilterFields />
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
