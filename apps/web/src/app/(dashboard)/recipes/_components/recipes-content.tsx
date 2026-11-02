"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryStates, parseAsString, parseAsInteger, parseAsArrayOf } from "nuqs";
import { useServerAction } from "zsa-react";
import { getRecipesAction } from "../recipes.actions";
import { RecipesTable } from "./recipes-table";
import { Input } from "@/components/ui/input";

type RecipesData = NonNullable<Awaited<ReturnType<typeof getRecipesAction>>[0]>;

export function RecipesContent({ initialData }: { initialData: RecipesData | null }) {
  const [filters, setFilters] = useQueryStates({
    search: parseAsString,
    mealType: parseAsString,
    difficulty: parseAsString,
    tags: parseAsArrayOf(parseAsString),
    seasons: parseAsArrayOf(parseAsString),
    minMealsEaten: parseAsInteger,
    maxMealsEaten: parseAsInteger,
    recipeBookId: parseAsString,
    sortBy: parseAsString,
    page: parseAsInteger.withDefault(1),
  });
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string>();
  const { execute, isPending } = useServerAction(getRecipesAction);
  const queryKey = JSON.stringify(filters);
  const loadedKey = useRef(queryKey);

  useEffect(() => { setSearchInput(filters.search ?? ""); }, [filters.search]);
  useEffect(() => {
    if (searchInput === (filters.search ?? "")) return;
    const timer = setTimeout(() => setFilters({ search: searchInput || null, page: 1 }), 200);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setFilters]);

  useEffect(() => {
    if (loadedKey.current === queryKey) return;
    let cancelled = false;
    const input = JSON.parse(queryKey);
    execute({
      ...input,
      search: input.search ?? undefined,
      mealType: input.mealType ?? undefined,
      difficulty: input.difficulty ?? undefined,
      tags: input.tags ?? undefined,
      seasons: input.seasons ?? undefined,
      minMealsEaten: input.minMealsEaten ?? undefined,
      maxMealsEaten: input.maxMealsEaten ?? undefined,
      recipeBookId: input.recipeBookId ?? undefined,
      sortBy: input.sortBy ?? undefined,
      limit: 20,
    }).then(([result, failure]) => {
      if (cancelled) return;
      setError(failure?.message);
      if (result) { setData(result); loadedKey.current = queryKey; }
    });
    return () => { cancelled = true; };
  }, [queryKey, execute]);

  return (
    <div className="space-y-4" aria-busy={isPending}>
      <Input aria-label="Search recipes" placeholder="Search recipes..." value={searchInput} onChange={event => setSearchInput(event.target.value)} />
      {error && <p role="alert">Error: {error}</p>}
      {isPending && <p role="status">Loading recipes...</p>}
      <RecipesTable recipes={data?.recipes ?? []} pagination={data?.pagination} />
    </div>
  );
}
