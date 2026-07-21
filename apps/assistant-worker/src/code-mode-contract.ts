export const RECIPE_NAMESPACE_TYPES = `
type RetrievalError = {
  code: "INVALID_INPUT" | "NO_MATCHES" | "NOT_AUTHORIZED" | "TRANSIENT_FAILURE";
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};
type RetrievalResult<T> = { ok: true; data: T } | { ok: false; error: RetrievalError };
type RelevanceEvidence = {
  score: number;
  matchedFields: string[];
  matchedTerms: string[];
  matchedFilters: string[];
};
type RecipeSummary = {
  id: string;
  name: string;
  emoji: string | null;
  mealType: string | null;
  difficulty: string | null;
  tags: string[];
  lastMadeAt: string | null;
  mealsEatenCount: number;
  relevance: RelevanceEvidence;
  dataQualityWarnings: string[];
};
type RecipeDetail = Omit<RecipeSummary, "relevance"> & {
  ingredients?: string[];
  instructions?: string | null;
  history?: Array<{
    weekId: string;
    weekName: string;
    weekStartDate: string | null;
    scheduledDate: string | null;
    made: boolean;
  }>;
  recipeLink: string | null;
  recipeBookId: string | null;
  page: string | null;
};
declare const recipes: {
  search(input: {
    text?: string;
    ingredientsAny?: string[];
    ingredientsAll?: string[];
    excludeIngredients?: string[];
    tagsAny?: string[];
    mealTypes?: string[];
    difficulties?: string[];
    notMadeSince?: string;
    limit?: number;
    cursor?: string;
  }): Promise<RetrievalResult<{
    items: RecipeSummary[];
    nextCursor: string | null;
    appliedFilters: {
      text: string | null;
      ingredientsAny: string[];
      ingredientsAll: string[];
      excludeIngredients: string[];
      tagsAny: string[];
      mealTypes: string[];
      difficulties: string[];
      notMadeSince: string | null;
      limit: number;
    };
  }>>;
  getMany(input: {
    ids: string[];
    include: Array<"ingredients" | "instructions" | "history">;
  }): Promise<RetrievalResult<{ items: RecipeDetail[]; missingIds: string[] }>>;
  facets(input: {}): Promise<{
    mealTypes: string[];
    difficulties: string[];
    tags: string[];
  }>;
};`;

export const WEEK_NAMESPACE_TYPES = `
type WeekRecipeSummary = {
  recipeId: string;
  name: string;
  emoji: string | null;
  mealType: string | null;
  made: boolean;
  order: number;
  scheduledDate: string | null;
};
type WeekSummary = {
  id: string;
  name: string;
  emoji: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  weekNumber: number | null;
  recipeCount: number;
  recipes?: WeekRecipeSummary[];
  relevance: RelevanceEvidence;
  dataQualityWarnings: string[];
};
type WeekDetail = Omit<WeekSummary, "relevance">;
declare const weeks: {
  search(input: {
    text?: string;
    statuses?: string[];
    containsRecipeIds?: string[];
    onDate?: string;
    from?: string;
    to?: string;
    includeRecipes?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<RetrievalResult<{
    items: WeekSummary[];
    nextCursor: string | null;
    appliedFilters: {
      text: string | null;
      statuses: string[];
      containsRecipeIds: string[];
      onDate: string | null;
      from: string | null;
      to: string | null;
      includeRecipes: boolean;
      limit: number;
    };
  }>>;
  getMany(input: {
    ids: string[];
    includeRecipes?: boolean;
  }): Promise<RetrievalResult<{ items: WeekDetail[]; missingIds: string[] }>>;
  findForRecipes(input: {
    recipeIds: string[];
    limit?: number;
    cursor?: string;
  }): Promise<RetrievalResult<{
    matches: Array<{
      recipeId: string;
      week: Omit<WeekDetail, "recipes">;
      made: boolean;
      order: number;
      scheduledDate: string | null;
    }>;
    nextCursor: string | null;
  }>>;
};`;

export const RECIPE_BOOK_NAMESPACE_TYPES = `
declare const recipeBooks: {
  search(input: {
    text?: string;
    ids?: string[];
    limit?: number;
  }): Promise<{ items: Array<{
    id: string;
    name: string;
    teamId: string | null;
    ownershipScope: "team" | "global";
  }>; count: number }>;
};`;

export const GROCERY_TEMPLATE_NAMESPACE_TYPES = `
declare const groceryTemplates: {
  search(input: {
    text?: string;
    ids?: string[];
    includeItems?: boolean;
    limit?: number;
  }): Promise<{ items: Array<{
    id: string;
    name: string;
    teamId: string | null;
    isDefault: boolean;
    template: Array<{
      category: string;
      order: number;
      items: Array<{ name: string; order: number }>;
    }> | null;
  }>; count: number }>;
};`;

export const GROCERY_ITEM_NAMESPACE_TYPES = `
declare const groceryItems: {
  search(input: {
    weekIds: string[];
    text?: string;
    checked?: boolean;
    categories?: string[];
    limit?: number;
  }): Promise<{ items: Array<{
    id: string;
    weekId: string;
    name: string;
    checked: boolean;
    order: number;
    category: string | null;
  }>; count: number }>;
};`;

export const WEEK_RECIPE_NAMESPACE_TYPES = `
declare const weekRecipes: {
  search(input: {
    weekIds?: string[];
    recipeIds?: string[];
    made?: boolean;
    limit?: number;
  }): Promise<{ items: Array<{
    id: string;
    weekId: string;
    recipeId: string;
    recipeName: string;
    scheduledDate: string | null;
    order: number;
    made: boolean;
  }>; count: number }>;
};`;

export const RECIPE_RELATION_NAMESPACE_TYPES = `
declare const recipeRelations: {
  search(input: {
    recipeIds: string[];
    limit?: number;
  }): Promise<{ items: Array<{
    id: string;
    mainRecipeId: string;
    mainRecipeName: string;
    sideRecipeId: string;
    sideRecipeName: string;
    relationType: string;
    order: number;
  }>; count: number }>;
};`;

export const SETTINGS_NAMESPACE_TYPES = `
declare const settings: {
  getFoodPlanning(input: {}): Promise<{
    recipeVisibilityMode: "all" | "team_only";
    defaultRecipeVisibility: "public" | "private" | "unlisted";
    autoAddIngredientsToGrocery: boolean;
  }>;
};`;

export const CODE_MODE_NAMESPACE_TYPES = {
  recipes: RECIPE_NAMESPACE_TYPES,
  weeks: WEEK_NAMESPACE_TYPES,
  recipeBooks: RECIPE_BOOK_NAMESPACE_TYPES,
  groceryTemplates: GROCERY_TEMPLATE_NAMESPACE_TYPES,
  groceryItems: GROCERY_ITEM_NAMESPACE_TYPES,
  weekRecipes: WEEK_RECIPE_NAMESPACE_TYPES,
  recipeRelations: RECIPE_RELATION_NAMESPACE_TYPES,
  settings: SETTINGS_NAMESPACE_TYPES,
} as const;

export const CHICKEN_RECIPE_SEARCH_EXAMPLE = `async () => {
  const recipeSearchResponse = await recipes.search({
    text: "chicken",
    mealTypes: ["Dinner"],
    limit: 3
  });
  if (!recipeSearchResponse.ok) return recipeSearchResponse;
  return recipeSearchResponse.data.items;
}`;

export const CURRENT_SCHEDULE_EXAMPLE = `async () => {
  const weekSearchResponse = await weeks.search({
    onDate: "2026-07-21",
    includeRecipes: true,
    limit: 5
  });
  if (!weekSearchResponse.ok) return weekSearchResponse;
  return weekSearchResponse.data.items;
}`;

export const TWO_RECIPE_COMPARISON_EXAMPLE = `async () => {
  const firstRecipeName = "Cilantro Lime Chicken Wings";
  const secondRecipeName = "Paper-wrapped Chicken";
  const [firstSearchResponse, secondSearchResponse] = await Promise.all([
    recipes.search({ text: firstRecipeName, limit: 10 }),
    recipes.search({ text: secondRecipeName, limit: 10 })
  ]);
  if (!firstSearchResponse.ok) return firstSearchResponse;
  if (!secondSearchResponse.ok) return secondSearchResponse;
  const firstMatch = firstSearchResponse.data.items.find(
    (item) => item.name.toLowerCase() === firstRecipeName.toLowerCase()
  );
  const secondMatch = secondSearchResponse.data.items.find(
    (item) => item.name.toLowerCase() === secondRecipeName.toLowerCase()
  );
  if (!firstMatch || !secondMatch) return { missingNames: [firstRecipeName, secondRecipeName] };
  const recipeDetailsResponse = await recipes.getMany({
    ids: [firstMatch.id, secondMatch.id],
    include: ["ingredients", "instructions", "history"]
  });
  if (!recipeDetailsResponse.ok) return recipeDetailsResponse;
  return recipeDetailsResponse.data;
}`;

export const CODE_MODE_DESCRIPTION = `Execute read-only recipe and meal-plan retrieval code.

Available globals and their exact contracts:
{{types}}

Rules:
- The callable namespaces are recipes, weeks, recipeBooks, groceryTemplates, groceryItems, weekRecipes, recipeRelations, and settings. There is no codemode namespace.
- Never shadow a callable namespace with a local variable; those names are reserved globals.
- Every retrieval call returns a RetrievalResult envelope. Check response.ok, then read response.data.items or response.data.matches.
- The additional food-planning namespaces return {items,count}; settings.getFoodPlanning returns the settings object directly.
- Search results are never bare arrays and never use .results or .weeks.
- recipes.getMany accepts ids, not names. Search exact titles first, select IDs, then call getMany.
- Use mealTypes as an array. Matching is normalized, so "Dinner" is the canonical example.
- Write one async JavaScript arrow function and return JSON-serializable data.
- Do not use TypeScript syntax, fetch, secrets, database APIs, mutation APIs, or imports. Mutations are handled outside Code Mode by the approval-required apply_team_changes tool.

Chicken dinner search:
${CHICKEN_RECIPE_SEARCH_EXAMPLE}

Current schedule lookup (replace onDate with the current UTC date from the system prompt):
${CURRENT_SCHEDULE_EXAMPLE}

Exact-title two-recipe comparison:
${TWO_RECIPE_COMPARISON_EXAMPLE}`;

export const CODE_MODE_ACCEPTANCE_EXAMPLES = {
  chickenSearch: CHICKEN_RECIPE_SEARCH_EXAMPLE,
  currentSchedule: CURRENT_SCHEDULE_EXAMPLE,
  twoRecipeComparison: TWO_RECIPE_COMPARISON_EXAMPLE,
} as const;
