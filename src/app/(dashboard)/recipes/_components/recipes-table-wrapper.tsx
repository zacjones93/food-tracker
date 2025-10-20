"use client";

import { useState, useMemo } from "react";
import { RecipesTable } from "./recipes-table";
import type { Recipe } from "@/db/schema";
import { useQueryState, parseAsInteger } from "nuqs";
import { Input } from "@/components/ui/input";
import { Search } from "@/components/ui/themed-icons";

interface RecipeWithWeekInfo extends Recipe {
  latestWeekId: string | null;
  latestWeekName: string | null;
  mealsEatenCount: number;
}

interface RecipesTableWrapperProps {
  recipes: RecipeWithWeekInfo[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function RecipesTableWrapper({ recipes, pagination }: RecipesTableWrapperProps) {
  const [searchInput, setSearchInput] = useState("");
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));

  // Filter recipes by client-side search only
  const filteredRecipes = useMemo(() => {
    if (!searchInput.trim()) return recipes;

    const search = searchInput.toLowerCase();
    return recipes.filter(recipe =>
      recipe.name?.toLowerCase().includes(search)
    );
  }, [recipes, searchInput]);

  // Paginate filtered results
  const limit = 20;
  const totalPages = Math.ceil(filteredRecipes.length / limit);
  const currentPage = Math.min(page, totalPages || 1);
  const paginatedRecipes = filteredRecipes.slice(
    (currentPage - 1) * limit,
    currentPage * limit
  );

  const paginationData = {
    page: currentPage,
    limit,
    total: filteredRecipes.length,
    totalPages,
  };

  return (
    <div className="space-y-4">
      {/* Client-side search input - both mobile and desktop */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-100" />
        <Input
          placeholder="Search recipes..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      <RecipesTable recipes={paginatedRecipes} pagination={paginationData} />
    </div>
  );
}
