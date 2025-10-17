"use client";

import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
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
import { Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useState, useEffect, useCallback } from "react";

export function RecipeFilters() {
  const [filters, setFilters] = useQueryStates(
    {
      search: parseAsString,
      mealType: parseAsString,
      difficulty: parseAsString,
      minMealsEaten: parseAsInteger,
      maxMealsEaten: parseAsInteger,
      page: parseAsInteger,
    },
    {
      history: "push",
    }
  );

  // Local state for debounced search
  const [searchInput, setSearchInput] = useState(filters.search || "");

  // Update local search input when URL param changes (e.g., on clear)
  useEffect(() => {
    setSearchInput(filters.search || "");
  }, [filters.search]);

  // Debounced search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters({ search: searchInput || null, page: 1 });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setFilters]);

  const handleClearFilters = () => {
    setSearchInput("");
    setFilters({
      search: null,
      mealType: null,
      difficulty: null,
      minMealsEaten: null,
      maxMealsEaten: null,
      page: 1,
    });
  };

  // Reset to page 1 when any filter changes (except search, which is handled above)
  const handleFilterChange = useCallback((updates: Record<string, string | number | null>) => {
    setFilters({ ...updates, page: 1 });
  }, [setFilters]);

  const hasActiveFilters =
    filters.search ||
    filters.mealType ||
    filters.difficulty ||
    filters.minMealsEaten !== null ||
    filters.maxMealsEaten !== null;

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search recipes..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
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
  );
}
