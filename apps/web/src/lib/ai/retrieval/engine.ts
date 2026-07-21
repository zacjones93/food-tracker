import {
  canonicalizeCase,
  canonicalizeIngredients,
  canonicalizeLegacyDate,
  canonicalizeNullableString,
  canonicalizeTags,
  toIsoTimestamp,
  tokenizeSearchText,
} from "./canonicalization";
import type {
  ParsedRecipeGetManyInput,
  ParsedRecipeSearchInput,
  ParsedWeekGetManyInput,
  ParsedWeekSearchInput,
  ParsedWeeksFindForRecipesInput,
  RecipeGetManyOutput,
  RecipeSearchOutput,
  WeekGetManyOutput,
  WeekSearchOutput,
  WeeksFindForRecipesOutput,
} from "./contracts";
import { decodeCursor, encodeCursor, fingerprintInput } from "./cursor";
import type {
  RecipeRetrievalRecord,
  RetrievalCorpus,
  RetrievalResult,
  WeekRecipeRetrievalRecord,
  WeekRetrievalRecord,
} from "./types";

const RECIPE_CURSOR_KIND = "recipe-search";
const WEEK_CURSOR_KIND = "week-search";
const RECIPE_WEEK_CURSOR_KIND = "recipe-week-search";

interface NormalizedRecipe {
  record: RecipeRetrievalRecord;
  name: string;
  nameKey: string;
  mealType: string | null;
  difficulty: string | null;
  tags: string[];
  ingredients: string[];
  ingredientDocument: string;
  bodyDocument: string;
  lastMadeAt: Date | null;
  lastMadeDocument: string;
  warnings: string[];
}

interface RecipeEvidence {
  score: number;
  matchedFields: string[];
  matchedTerms: string[];
  matchedFilters: string[];
}

interface RankedRecipe {
  recipe: NormalizedRecipe;
  evidence: RecipeEvidence;
}

interface NormalizedWeek {
  record: WeekRetrievalRecord;
  name: string;
  nameKey: string;
  status: string | null;
  startDate: Date | null;
  endDate: Date | null;
  warnings: string[];
}

interface WeekEvidence {
  score: number;
  matchedFields: string[];
  matchedTerms: string[];
  matchedFilters: string[];
}

interface RankedWeek {
  week: NormalizedWeek;
  evidence: WeekEvidence;
}

export function searchRecipes({
  corpus,
  teamId,
  input,
}: {
  corpus: RetrievalCorpus;
  teamId: string;
  input: ParsedRecipeSearchInput;
}): RetrievalResult<RecipeSearchOutput> {
  const appliedFilters = normalizeRecipeFilters(input);
  const fingerprint = fingerprintInput({ ...appliedFilters, limit: undefined });
  const cursorPosition = input.cursor
    ? decodeCursor({
        cursor: input.cursor,
        expectedKind: RECIPE_CURSOR_KIND,
        expectedFingerprint: fingerprint,
      })?.position
    : null;

  if (input.cursor && !isRecipeCursorPosition(cursorPosition))
    return invalidCursorResult("recipe search");
  const validatedCursorPosition = isRecipeCursorPosition(cursorPosition)
    ? cursorPosition
    : null;

  const rankedRecipes = corpus.recipes
    .filter((recipe) => recipe.teamId === teamId)
    .map(normalizeRecipe)
    .filter((recipe) => matchesRecipeFilters({ recipe, filters: appliedFilters }))
    .map((recipe) => ({
      recipe,
      evidence: createRecipeEvidence({ recipe, filters: appliedFilters }),
    }))
    .sort(compareRankedRecipes)
    .filter((rankedRecipe) =>
      validatedCursorPosition
        ? isRecipeAfterCursor({ rankedRecipe, cursorPosition: validatedCursorPosition })
        : true,
    );

  if (rankedRecipes.length === 0) return noMatchesResult("No recipes matched the search");

  const page = rankedRecipes.slice(0, appliedFilters.limit);
  const hasMore = rankedRecipes.length > appliedFilters.limit;
  const lastItem = page.at(-1);
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          kind: RECIPE_CURSOR_KIND,
          fingerprint,
          position: {
            score: lastItem.evidence.score,
            name: lastItem.recipe.nameKey,
            id: lastItem.recipe.record.id,
          },
        })
      : null;

  return {
    ok: true,
    data: {
      items: page.map(({ recipe, evidence }) => createRecipeSummary({ recipe, evidence })),
      nextCursor,
      appliedFilters,
    },
  };
}

export function getManyRecipes({
  corpus,
  teamId,
  input,
}: {
  corpus: RetrievalCorpus;
  teamId: string;
  input: ParsedRecipeGetManyInput;
}): RetrievalResult<RecipeGetManyOutput> {
  const requestedIds = Array.from(new Set(input.ids));
  const authorizedRecipes = new Map(
    corpus.recipes
      .filter((recipe) => recipe.teamId === teamId && requestedIds.includes(recipe.id))
      .map((recipe) => [recipe.id, normalizeRecipe(recipe)]),
  );
  const authorizedWeeks = new Map(
    corpus.weeks
      .filter((week) => week.teamId === teamId)
      .map((week) => [week.id, normalizeWeek(week)]),
  );
  const items = requestedIds.flatMap((recipeId) => {
    const recipe = authorizedRecipes.get(recipeId);
    if (!recipe) return [];

    const history = corpus.weekRecipes
      .filter((weekRecipe) => weekRecipe.recipeId === recipeId)
      .flatMap((weekRecipe) => {
        const week = authorizedWeeks.get(weekRecipe.weekId);
        if (!week) return [];

        return [
          {
            weekId: week.record.id,
            weekName: week.name,
            weekStartDate: toIsoTimestamp(week.startDate),
            scheduledDate: toIsoTimestamp(weekRecipe.scheduledDate),
            made: weekRecipe.made,
          },
        ];
      })
      .sort(compareRecipeHistory);

    return [
      {
        ...createRecipeSummaryBase(recipe),
        ...(input.include.includes("ingredients") ? { ingredients: recipe.ingredients } : {}),
        ...(input.include.includes("instructions")
          ? { instructions: canonicalizeNullableString(recipe.record.recipeBody) }
          : {}),
        ...(input.include.includes("history") ? { history } : {}),
        recipeLink: canonicalizeNullableString(recipe.record.recipeLink),
        recipeBookId: canonicalizeNullableString(recipe.record.recipeBookId),
        page: canonicalizeNullableString(recipe.record.page),
      },
    ];
  });

  if (items.length === 0) return noMatchesResult("No authorized recipes matched the requested IDs");

  return {
    ok: true,
    data: {
      items,
      missingIds: requestedIds.filter((recipeId) => !authorizedRecipes.has(recipeId)),
    },
  };
}

export function searchWeeks({
  corpus,
  teamId,
  input,
}: {
  corpus: RetrievalCorpus;
  teamId: string;
  input: ParsedWeekSearchInput;
}): RetrievalResult<WeekSearchOutput> {
  const appliedFilters = normalizeWeekFilters(input);
  const fingerprint = fingerprintInput({ ...appliedFilters, limit: undefined });
  const cursorPosition = input.cursor
    ? decodeCursor({
        cursor: input.cursor,
        expectedKind: WEEK_CURSOR_KIND,
        expectedFingerprint: fingerprint,
      })?.position
    : null;

  if (input.cursor && !isWeekCursorPosition(cursorPosition))
    return invalidCursorResult("week search");
  const validatedCursorPosition = isWeekCursorPosition(cursorPosition) ? cursorPosition : null;

  const authorizedRecipes = new Map(
    corpus.recipes
      .filter((recipe) => recipe.teamId === teamId)
      .map((recipe) => [recipe.id, normalizeRecipe(recipe)]),
  );
  const authorizedWeeks = corpus.weeks
    .filter((week) => week.teamId === teamId)
    .map(normalizeWeek);
  const authorizedWeekIds = new Set(authorizedWeeks.map((week) => week.record.id));
  const relationships = corpus.weekRecipes.filter(
    (weekRecipe) =>
      authorizedWeekIds.has(weekRecipe.weekId) && authorizedRecipes.has(weekRecipe.recipeId),
  );
  const recipeIdsByWeek = indexRecipeIdsByWeek(relationships);

  const rankedWeeks = authorizedWeeks
    .filter((week) =>
      matchesWeekFilters({
        week,
        recipeIds: recipeIdsByWeek.get(week.record.id) ?? new Set(),
        filters: appliedFilters,
      }),
    )
    .map((week) => ({
      week,
      evidence: createWeekEvidence({ week, filters: appliedFilters }),
    }))
    .sort(compareRankedWeeks)
    .filter((rankedWeek) =>
      validatedCursorPosition
        ? isWeekAfterCursor({ rankedWeek, cursorPosition: validatedCursorPosition })
        : true,
    );

  if (rankedWeeks.length === 0) return noMatchesResult("No weeks matched the search");

  const page = rankedWeeks.slice(0, appliedFilters.limit);
  const hasMore = rankedWeeks.length > appliedFilters.limit;
  const lastItem = page.at(-1);
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          kind: WEEK_CURSOR_KIND,
          fingerprint,
          position: {
            score: lastItem.evidence.score,
            startTime: lastItem.week.startDate?.getTime() ?? null,
            name: lastItem.week.nameKey,
            id: lastItem.week.record.id,
          },
        })
      : null;

  return {
    ok: true,
    data: {
      items: page.map(({ week, evidence }) =>
        createWeekSummary({
          week,
          evidence,
          includeRecipes: appliedFilters.includeRecipes,
          relationships,
          recipes: authorizedRecipes,
        }),
      ),
      nextCursor,
      appliedFilters,
    },
  };
}

export function getManyWeeks({
  corpus,
  teamId,
  input,
}: {
  corpus: RetrievalCorpus;
  teamId: string;
  input: ParsedWeekGetManyInput;
}): RetrievalResult<WeekGetManyOutput> {
  const requestedIds = Array.from(new Set(input.ids));
  const authorizedRecipes = new Map(
    corpus.recipes
      .filter((recipe) => recipe.teamId === teamId)
      .map((recipe) => [recipe.id, normalizeRecipe(recipe)]),
  );
  const authorizedWeeks = new Map(
    corpus.weeks
      .filter((week) => week.teamId === teamId && requestedIds.includes(week.id))
      .map((week) => [week.id, normalizeWeek(week)]),
  );
  const relationships = corpus.weekRecipes.filter(
    (weekRecipe) =>
      authorizedWeeks.has(weekRecipe.weekId) && authorizedRecipes.has(weekRecipe.recipeId),
  );
  const emptyEvidence = createEmptyEvidence();
  const items = requestedIds.flatMap((weekId) => {
    const week = authorizedWeeks.get(weekId);
    if (!week) return [];

    const summary = createWeekSummary({
      week,
      evidence: emptyEvidence,
      includeRecipes: input.includeRecipes,
      relationships,
      recipes: authorizedRecipes,
    });
    return [createWeekDetail({ summary, includeRecipes: input.includeRecipes })];
  });

  if (items.length === 0) return noMatchesResult("No authorized weeks matched the requested IDs");

  return {
    ok: true,
    data: {
      items,
      missingIds: requestedIds.filter((weekId) => !authorizedWeeks.has(weekId)),
    },
  };
}

export function findWeeksForRecipes({
  corpus,
  teamId,
  input,
}: {
  corpus: RetrievalCorpus;
  teamId: string;
  input: ParsedWeeksFindForRecipesInput;
}): RetrievalResult<WeeksFindForRecipesOutput> {
  const recipeIds = Array.from(new Set(input.recipeIds));
  const authorizedRecipeIds = new Set(
    corpus.recipes
      .filter((recipe) => recipe.teamId === teamId && recipeIds.includes(recipe.id))
      .map((recipe) => recipe.id),
  );
  const authorizedWeeks = new Map(
    corpus.weeks
      .filter((week) => week.teamId === teamId)
      .map((week) => [week.id, normalizeWeek(week)]),
  );
  const fingerprint = fingerprintInput({ recipeIds: [...recipeIds].sort() });
  const cursorPosition = input.cursor
    ? decodeCursor({
        cursor: input.cursor,
        expectedKind: RECIPE_WEEK_CURSOR_KIND,
        expectedFingerprint: fingerprint,
      })?.position
    : null;

  if (input.cursor && !isRecipeWeekCursorPosition(cursorPosition))
    return invalidCursorResult("recipe week search");
  const validatedCursorPosition = isRecipeWeekCursorPosition(cursorPosition)
    ? cursorPosition
    : null;

  const matches = corpus.weekRecipes
    .filter(
      (weekRecipe) =>
        authorizedRecipeIds.has(weekRecipe.recipeId) && authorizedWeeks.has(weekRecipe.weekId),
    )
    .map((weekRecipe) => ({
      weekRecipe,
      week: authorizedWeeks.get(weekRecipe.weekId)!,
    }))
    .sort(compareRecipeWeekMatches)
    .filter((match) =>
      validatedCursorPosition
        ? isRecipeWeekAfterCursor({ match, cursorPosition: validatedCursorPosition })
        : true,
    );

  if (matches.length === 0)
    return noMatchesResult("No authorized weeks contained the requested recipes");

  const page = matches.slice(0, input.limit);
  const hasMore = matches.length > input.limit;
  const lastItem = page.at(-1);
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          kind: RECIPE_WEEK_CURSOR_KIND,
          fingerprint,
          position: {
            startTime: lastItem.week.startDate?.getTime() ?? null,
            weekId: lastItem.week.record.id,
            recipeId: lastItem.weekRecipe.recipeId,
            relationId: lastItem.weekRecipe.id,
          },
        })
      : null;
  const emptyEvidence = createEmptyEvidence();

  return {
    ok: true,
    data: {
      matches: page.map(({ weekRecipe, week }) => {
        const summary = createWeekSummary({
          week,
          evidence: emptyEvidence,
          includeRecipes: false,
          relationships: [],
          recipes: new Map(),
        });
        return {
          recipeId: weekRecipe.recipeId,
          week: createWeekDetail({ summary, includeRecipes: false }),
          made: weekRecipe.made,
          order: weekRecipe.order ?? 0,
          scheduledDate: toIsoTimestamp(weekRecipe.scheduledDate),
        };
      }),
      nextCursor,
    },
  };
}

function normalizeRecipeFilters(
  input: ParsedRecipeSearchInput,
): RecipeSearchOutput["appliedFilters"] {
  return {
    text: canonicalizeCase(input.text),
    ingredientsAny: normalizeFilterList(input.ingredientsAny),
    ingredientsAll: normalizeFilterList(input.ingredientsAll),
    excludeIngredients: normalizeFilterList(input.excludeIngredients),
    tagsAny: canonicalizeTags(input.tagsAny),
    mealTypes: normalizeFilterList(input.mealTypes),
    difficulties: normalizeFilterList(input.difficulties),
    notMadeSince: input.notMadeSince ?? null,
    limit: input.limit,
  };
}

function normalizeWeekFilters(input: ParsedWeekSearchInput): WeekSearchOutput["appliedFilters"] {
  return {
    text: canonicalizeCase(input.text),
    statuses: normalizeFilterList(input.statuses),
    containsRecipeIds: Array.from(new Set(input.containsRecipeIds ?? [])).sort(),
    onDate: input.onDate ?? null,
    from: input.from ?? null,
    to: input.to ?? null,
    includeRecipes: input.includeRecipes,
    limit: input.limit,
  };
}

function normalizeFilterList(values: string[] | undefined): string[] {
  return Array.from(
    new Set(values?.map(canonicalizeCase).filter((value): value is string => value !== null) ?? []),
  ).sort();
}

function normalizeRecipe(record: RecipeRetrievalRecord): NormalizedRecipe {
  const name = canonicalizeNullableString(record.name) ?? record.id;
  const mealType = canonicalizeCase(record.mealType);
  const difficulty = canonicalizeCase(record.difficulty);
  const tags = canonicalizeTags(record.tags);
  const ingredients = canonicalizeIngredients(record.ingredients);
  const lastMadeAt = canonicalizeLegacyDate(record.lastMadeDate);
  const warnings: string[] = [];

  if (record.mealType !== null && !mealType) warnings.push("meal_type_unset_or_sentinel");
  if (record.difficulty !== null && !difficulty) warnings.push("difficulty_unset_or_sentinel");
  if (record.tags !== null && tags.length === 0) warnings.push("tags_unusable");
  if (
    record.lastMadeDate !== null &&
    (typeof record.lastMadeDate !== "string" ||
      canonicalizeNullableString(record.lastMadeDate) !== null) &&
    !lastMadeAt
  )
    warnings.push("last_made_date_invalid");

  return {
    record,
    name,
    nameKey: canonicalizeCase(name) ?? record.id,
    mealType,
    difficulty,
    tags,
    ingredients,
    ingredientDocument: ingredients.map(canonicalizeCase).filter(Boolean).join(" "),
    bodyDocument: canonicalizeCase(record.recipeBody) ?? "",
    lastMadeAt,
    lastMadeDocument: lastMadeAt
      ? `made last made ${lastMadeAt.toISOString().slice(0, 10)}`
      : "never made not made",
    warnings,
  };
}

function normalizeWeek(record: WeekRetrievalRecord): NormalizedWeek {
  const name = canonicalizeNullableString(record.name) ?? record.id;
  const status = canonicalizeCase(record.status);
  const startDate = canonicalizeLegacyDate(record.startDate);
  const endDate = canonicalizeLegacyDate(record.endDate);
  const warnings: string[] = [];

  if (!status) warnings.push("status_unset_or_sentinel");
  if (record.startDate !== null && !startDate) warnings.push("start_date_invalid");
  if (record.endDate !== null && !endDate) warnings.push("end_date_invalid");
  if (startDate && endDate && startDate > endDate) warnings.push("date_range_inverted");

  return {
    record,
    name,
    nameKey: canonicalizeCase(name) ?? record.id,
    status,
    startDate,
    endDate,
    warnings,
  };
}

function matchesRecipeFilters({
  recipe,
  filters,
}: {
  recipe: NormalizedRecipe;
  filters: RecipeSearchOutput["appliedFilters"];
}): boolean {
  const searchableFields = createRecipeSearchableFields(recipe);
  const textTokens = tokenizeSearchText(filters.text);

  if (
    textTokens.length > 0 &&
    !textTokens.every((token) => Object.values(searchableFields).some((value) => value.includes(token)))
  )
    return false;
  if (
    filters.ingredientsAny.length > 0 &&
    !filters.ingredientsAny.some((ingredient) => recipe.ingredientDocument.includes(ingredient))
  )
    return false;
  if (
    filters.ingredientsAll.length > 0 &&
    !filters.ingredientsAll.every((ingredient) => recipe.ingredientDocument.includes(ingredient))
  )
    return false;
  if (filters.excludeIngredients.some((ingredient) => recipe.ingredientDocument.includes(ingredient)))
    return false;
  if (filters.tagsAny.length > 0 && !filters.tagsAny.some((tag) => recipe.tags.includes(tag)))
    return false;
  if (filters.mealTypes.length > 0 && !filters.mealTypes.includes(recipe.mealType ?? ""))
    return false;
  if (filters.difficulties.length > 0 && !filters.difficulties.includes(recipe.difficulty ?? ""))
    return false;

  const notMadeSince = canonicalizeLegacyDate(filters.notMadeSince);
  if (notMadeSince && recipe.lastMadeAt && recipe.lastMadeAt >= notMadeSince) return false;

  return true;
}

function createRecipeSearchableFields(recipe: NormalizedRecipe): Record<string, string> {
  return {
    name: recipe.nameKey,
    ingredients: recipe.ingredientDocument,
    instructions: recipe.bodyDocument,
    tags: recipe.tags.join(" "),
    mealType: recipe.mealType ?? "",
    difficulty: recipe.difficulty ?? "",
    lastMade: recipe.lastMadeDocument,
  };
}

function createRecipeEvidence({
  recipe,
  filters,
}: {
  recipe: NormalizedRecipe;
  filters: RecipeSearchOutput["appliedFilters"];
}): RecipeEvidence {
  const weights: Record<string, number> = {
    name: 40,
    ingredients: 25,
    tags: 22,
    instructions: 10,
    mealType: 8,
    difficulty: 8,
    lastMade: 5,
  };
  const fields = createRecipeSearchableFields(recipe);
  const terms = tokenizeSearchText(filters.text);
  const matchedFields = new Set<string>();
  const matchedTerms = new Set<string>();
  let score = filters.text && recipe.nameKey === filters.text ? 100 : 0;

  for (const term of terms) {
    for (const [field, value] of Object.entries(fields)) {
      if (!value.includes(term)) continue;
      matchedFields.add(field);
      matchedTerms.add(term);
      score += weights[field] ?? 1;
    }
  }

  const matchedFilters = [
    ...(filters.ingredientsAny.length > 0 ? ["ingredientsAny"] : []),
    ...(filters.ingredientsAll.length > 0 ? ["ingredientsAll"] : []),
    ...(filters.excludeIngredients.length > 0 ? ["excludeIngredients"] : []),
    ...(filters.tagsAny.length > 0 ? ["tagsAny"] : []),
    ...(filters.mealTypes.length > 0 ? ["mealTypes"] : []),
    ...(filters.difficulties.length > 0 ? ["difficulties"] : []),
    ...(filters.notMadeSince ? ["notMadeSince"] : []),
  ];

  return {
    score,
    matchedFields: [...matchedFields].sort(),
    matchedTerms: [...matchedTerms].sort(),
    matchedFilters,
  };
}

function compareRankedRecipes(left: RankedRecipe, right: RankedRecipe): number {
  return (
    right.evidence.score - left.evidence.score ||
    left.recipe.nameKey.localeCompare(right.recipe.nameKey) ||
    left.recipe.record.id.localeCompare(right.recipe.record.id)
  );
}

function createRecipeSummary({
  recipe,
  evidence,
}: {
  recipe: NormalizedRecipe;
  evidence: RecipeEvidence;
}): RecipeSearchOutput["items"][number] {
  return { ...createRecipeSummaryBase(recipe), relevance: evidence };
}

function createRecipeSummaryBase(recipe: NormalizedRecipe) {
  return {
    id: recipe.record.id,
    name: recipe.name,
    emoji: canonicalizeNullableString(recipe.record.emoji),
    mealType: recipe.mealType,
    difficulty: recipe.difficulty,
    tags: recipe.tags,
    lastMadeAt: toIsoTimestamp(recipe.lastMadeAt),
    mealsEatenCount: Math.max(0, recipe.record.mealsEatenCount),
    dataQualityWarnings: recipe.warnings,
  };
}

function matchesWeekFilters({
  week,
  recipeIds,
  filters,
}: {
  week: NormalizedWeek;
  recipeIds: Set<string>;
  filters: WeekSearchOutput["appliedFilters"];
}): boolean {
  const fields = createWeekSearchableFields(week);
  const textTokens = tokenizeSearchText(filters.text);

  if (
    textTokens.length > 0 &&
    !textTokens.every((token) => Object.values(fields).some((value) => value.includes(token)))
  )
    return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(week.status ?? "")) return false;
  if (
    filters.containsRecipeIds.length > 0 &&
    !filters.containsRecipeIds.some((recipeId) => recipeIds.has(recipeId))
  )
    return false;

  const onDate = canonicalizeLegacyDate(filters.onDate);
  const from = canonicalizeLegacyDate(filters.from);
  const to = canonicalizeLegacyDate(filters.to);
  if (onDate && !weekContainsDate({ week, date: onDate })) return false;
  if ((from || to) && !weekOverlapsRange({ week, from, to })) return false;

  return true;
}

function createWeekSearchableFields(week: NormalizedWeek): Record<string, string> {
  return {
    name: week.nameKey,
    status: week.status ?? "",
    startDate: week.startDate?.toISOString().slice(0, 10) ?? "",
    endDate: week.endDate?.toISOString().slice(0, 10) ?? "",
  };
}

function createWeekEvidence({
  week,
  filters,
}: {
  week: NormalizedWeek;
  filters: WeekSearchOutput["appliedFilters"];
}): WeekEvidence {
  const fields = createWeekSearchableFields(week);
  const weights: Record<string, number> = { name: 40, status: 10, startDate: 8, endDate: 8 };
  const terms = tokenizeSearchText(filters.text);
  const matchedFields = new Set<string>();
  const matchedTerms = new Set<string>();
  let score = filters.text && week.nameKey === filters.text ? 100 : 0;

  for (const term of terms) {
    for (const [field, value] of Object.entries(fields)) {
      if (!value.includes(term)) continue;
      matchedFields.add(field);
      matchedTerms.add(term);
      score += weights[field] ?? 1;
    }
  }

  return {
    score,
    matchedFields: [...matchedFields].sort(),
    matchedTerms: [...matchedTerms].sort(),
    matchedFilters: [
      ...(filters.statuses.length > 0 ? ["statuses"] : []),
      ...(filters.containsRecipeIds.length > 0 ? ["containsRecipeIds"] : []),
      ...(filters.onDate ? ["onDate"] : []),
      ...(filters.from || filters.to ? ["dateRange"] : []),
    ],
  };
}

function compareRankedWeeks(left: RankedWeek, right: RankedWeek): number {
  return (
    right.evidence.score - left.evidence.score ||
    compareNullableDatesDescending(left.week.startDate, right.week.startDate) ||
    left.week.nameKey.localeCompare(right.week.nameKey) ||
    left.week.record.id.localeCompare(right.week.record.id)
  );
}

function createWeekSummary({
  week,
  evidence,
  includeRecipes,
  relationships,
  recipes,
}: {
  week: NormalizedWeek;
  evidence: WeekEvidence;
  includeRecipes: boolean;
  relationships: WeekRecipeRetrievalRecord[];
  recipes: Map<string, NormalizedRecipe>;
}): WeekSearchOutput["items"][number] {
  const weekRelationships = relationships
    .filter((weekRecipe) => weekRecipe.weekId === week.record.id && recipes.has(weekRecipe.recipeId))
    .sort(compareWeekRecipes);

  return {
    id: week.record.id,
    name: week.name,
    emoji: canonicalizeNullableString(week.record.emoji),
    status: week.status,
    startDate: toIsoTimestamp(week.startDate),
    endDate: toIsoTimestamp(week.endDate),
    weekNumber: week.record.weekNumber,
    recipeCount: weekRelationships.length,
    ...(includeRecipes
      ? {
          recipes: weekRelationships.map((weekRecipe) => {
            const recipe = recipes.get(weekRecipe.recipeId);
            if (!recipe) throw new Error("Authorized recipe index is inconsistent");
            return {
              recipeId: recipe.record.id,
              name: recipe.name,
              emoji: canonicalizeNullableString(recipe.record.emoji),
              mealType: recipe.mealType,
              made: weekRecipe.made,
              order: weekRecipe.order ?? 0,
              scheduledDate: toIsoTimestamp(weekRecipe.scheduledDate),
            };
          }),
        }
      : {}),
    relevance: evidence,
    dataQualityWarnings: week.warnings,
  };
}

function createWeekDetail({
  summary,
  includeRecipes,
}: {
  summary: WeekSearchOutput["items"][number];
  includeRecipes: boolean;
}) {
  return {
    id: summary.id,
    name: summary.name,
    emoji: summary.emoji,
    status: summary.status,
    startDate: summary.startDate,
    endDate: summary.endDate,
    weekNumber: summary.weekNumber,
    recipeCount: summary.recipeCount,
    ...(includeRecipes && summary.recipes ? { recipes: summary.recipes } : {}),
    dataQualityWarnings: summary.dataQualityWarnings,
  };
}

function weekContainsDate({ week, date }: { week: NormalizedWeek; date: Date }): boolean {
  if (!week.startDate || !week.endDate) return false;

  const dateKey = date.toISOString().slice(0, 10);
  return (
    week.startDate.toISOString().slice(0, 10) <= dateKey &&
    week.endDate.toISOString().slice(0, 10) >= dateKey
  );
}

function weekOverlapsRange({
  week,
  from,
  to,
}: {
  week: NormalizedWeek;
  from: Date | null;
  to: Date | null;
}): boolean {
  if (!week.startDate || !week.endDate) return false;
  if (from && week.endDate < from) return false;
  if (to) {
    const endOfDay = new Date(to.getTime() + 86_400_000 - 1);
    if (week.startDate > endOfDay) return false;
  }

  return true;
}

function indexRecipeIdsByWeek(
  relationships: WeekRecipeRetrievalRecord[],
): Map<string, Set<string>> {
  const recipeIdsByWeek = new Map<string, Set<string>>();

  for (const relationship of relationships) {
    const recipeIds = recipeIdsByWeek.get(relationship.weekId) ?? new Set<string>();
    recipeIds.add(relationship.recipeId);
    recipeIdsByWeek.set(relationship.weekId, recipeIds);
  }

  return recipeIdsByWeek;
}

function compareRecipeHistory(
  left: { weekStartDate: string | null; weekId: string },
  right: { weekStartDate: string | null; weekId: string },
): number {
  return (
    compareNullableStringsDescending(left.weekStartDate, right.weekStartDate) ||
    left.weekId.localeCompare(right.weekId)
  );
}

function compareWeekRecipes(
  left: WeekRecipeRetrievalRecord,
  right: WeekRecipeRetrievalRecord,
): number {
  return (
    compareNullableDatesAscending(
      canonicalizeLegacyDate(left.scheduledDate),
      canonicalizeLegacyDate(right.scheduledDate),
    ) ||
    (left.order ?? 0) - (right.order ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function compareRecipeWeekMatches(
  left: { week: NormalizedWeek; weekRecipe: WeekRecipeRetrievalRecord },
  right: { week: NormalizedWeek; weekRecipe: WeekRecipeRetrievalRecord },
): number {
  return (
    compareNullableDatesDescending(left.week.startDate, right.week.startDate) ||
    left.week.record.id.localeCompare(right.week.record.id) ||
    left.weekRecipe.recipeId.localeCompare(right.weekRecipe.recipeId) ||
    left.weekRecipe.id.localeCompare(right.weekRecipe.id)
  );
}

function isRecipeCursorPosition(
  position: Record<string, unknown> | null | undefined,
): position is { score: number; name: string; id: string } {
  return (
    !!position &&
    typeof position.score === "number" &&
    Number.isFinite(position.score) &&
    typeof position.name === "string" &&
    typeof position.id === "string"
  );
}

function isWeekCursorPosition(
  position: Record<string, unknown> | null | undefined,
): position is { score: number; startTime: number | null; name: string; id: string } {
  return (
    !!position &&
    typeof position.score === "number" &&
    Number.isFinite(position.score) &&
    (position.startTime === null ||
      (typeof position.startTime === "number" && Number.isFinite(position.startTime))) &&
    typeof position.name === "string" &&
    typeof position.id === "string"
  );
}

function isRecipeWeekCursorPosition(
  position: Record<string, unknown> | null | undefined,
): position is {
  startTime: number | null;
  weekId: string;
  recipeId: string;
  relationId: string;
} {
  return (
    !!position &&
    (position.startTime === null ||
      (typeof position.startTime === "number" && Number.isFinite(position.startTime))) &&
    typeof position.weekId === "string" &&
    typeof position.recipeId === "string" &&
    typeof position.relationId === "string"
  );
}

function isRecipeAfterCursor({
  rankedRecipe,
  cursorPosition,
}: {
  rankedRecipe: RankedRecipe;
  cursorPosition: { score: number; name: string; id: string };
}): boolean {
  if (rankedRecipe.evidence.score !== cursorPosition.score)
    return rankedRecipe.evidence.score < cursorPosition.score;
  if (rankedRecipe.recipe.nameKey !== cursorPosition.name)
    return rankedRecipe.recipe.nameKey > cursorPosition.name;
  return rankedRecipe.recipe.record.id > cursorPosition.id;
}

function isWeekAfterCursor({
  rankedWeek,
  cursorPosition,
}: {
  rankedWeek: RankedWeek;
  cursorPosition: { score: number; startTime: number | null; name: string; id: string };
}): boolean {
  if (rankedWeek.evidence.score !== cursorPosition.score)
    return rankedWeek.evidence.score < cursorPosition.score;

  const startComparison = compareNullableDatesDescending(
    rankedWeek.week.startDate,
    cursorPosition.startTime === null ? null : new Date(cursorPosition.startTime),
  );
  if (startComparison !== 0) return startComparison > 0;
  if (rankedWeek.week.nameKey !== cursorPosition.name)
    return rankedWeek.week.nameKey > cursorPosition.name;
  return rankedWeek.week.record.id > cursorPosition.id;
}

function isRecipeWeekAfterCursor({
  match,
  cursorPosition,
}: {
  match: { week: NormalizedWeek; weekRecipe: WeekRecipeRetrievalRecord };
  cursorPosition: {
    startTime: number | null;
    weekId: string;
    recipeId: string;
    relationId: string;
  };
}): boolean {
  const startComparison = compareNullableDatesDescending(
    match.week.startDate,
    cursorPosition.startTime === null ? null : new Date(cursorPosition.startTime),
  );
  if (startComparison !== 0) return startComparison > 0;
  if (match.week.record.id !== cursorPosition.weekId)
    return match.week.record.id > cursorPosition.weekId;
  if (match.weekRecipe.recipeId !== cursorPosition.recipeId)
    return match.weekRecipe.recipeId > cursorPosition.recipeId;
  return match.weekRecipe.id > cursorPosition.relationId;
}

function compareNullableDatesDescending(left: Date | null, right: Date | null): number {
  if (left && right) return right.getTime() - left.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function compareNullableDatesAscending(left: Date | null, right: Date | null): number {
  if (left && right) return left.getTime() - right.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function compareNullableStringsDescending(left: string | null, right: string | null): number {
  if (left && right) return right.localeCompare(left);
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function createEmptyEvidence(): WeekEvidence {
  return { score: 0, matchedFields: [], matchedTerms: [], matchedFilters: [] };
}

function invalidCursorResult<Data>(scope: string): RetrievalResult<Data> {
  return {
    ok: false,
    error: {
      code: "INVALID_INPUT",
      message: `The ${scope} cursor is invalid or belongs to different filters`,
      retryable: false,
    },
  };
}

function noMatchesResult<Data>(message: string): RetrievalResult<Data> {
  return {
    ok: false,
    error: { code: "NO_MATCHES", message, retryable: false },
  };
}
