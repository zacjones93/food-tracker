import { z } from "zod/v4";

import { canonicalizeLegacyDate } from "./canonicalization";

const MAX_SEARCH_LIMIT = 50;
const boundedLimitSchema = z
  .number()
  .int()
  .finite()
  .optional()
  .default(10)
  .transform((limit) => Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT)));
const cursorSchema = z.string().min(1).max(2_048).optional();
const identifierSchema = z.string().trim().min(1).max(128);
const identifierListSchema = z.array(identifierSchema).min(1).max(50);
const filterValueSchema = z.string().trim().min(1).max(100);
const filterListSchema = z.array(filterValueSchema).min(1).max(20);
const searchTextSchema = z.string().trim().min(1).max(300).optional();
const dateInputSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => canonicalizeLegacyDate(value) !== null, "Invalid calendar date");

export const recipeSearchInputSchema = z
  .object({
    text: searchTextSchema,
    ingredientsAny: filterListSchema.optional(),
    ingredientsAll: filterListSchema.optional(),
    excludeIngredients: filterListSchema.optional(),
    tagsAny: filterListSchema.optional(),
    mealTypes: filterListSchema.optional(),
    difficulties: filterListSchema.optional(),
    notMadeSince: dateInputSchema.optional(),
    limit: boundedLimitSchema,
    cursor: cursorSchema,
  })
  .strict();

export const recipeGetManyInputSchema = z
  .object({
    ids: identifierListSchema,
    include: z
      .array(z.enum(["ingredients", "instructions", "history"]))
      .min(1)
      .max(3),
  })
  .strict();

export const weekSearchInputSchema = z
  .object({
    text: searchTextSchema,
    statuses: filterListSchema.optional(),
    containsRecipeIds: identifierListSchema.optional(),
    onDate: dateInputSchema.optional(),
    from: dateInputSchema.optional(),
    to: dateInputSchema.optional(),
    includeRecipes: z.boolean().optional().default(false),
    limit: boundedLimitSchema,
    cursor: cursorSchema,
  })
  .strict()
  .refine(
    ({ from, to }) => !from || !to || from <= to,
    { message: "from must be on or before to", path: ["from"] },
  );

export const weekGetManyInputSchema = z
  .object({
    ids: identifierListSchema,
    includeRecipes: z.boolean().optional().default(true),
  })
  .strict();

export const weeksFindForRecipesInputSchema = z
  .object({
    recipeIds: identifierListSchema,
    limit: boundedLimitSchema,
    cursor: cursorSchema,
  })
  .strict();

export const relevanceEvidenceSchema = z.object({
  score: z.number().int().nonnegative(),
  matchedFields: z.array(z.string()),
  matchedTerms: z.array(z.string()),
  matchedFilters: z.array(z.string()),
});

export const recipeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  mealType: z.string().nullable(),
  difficulty: z.string().nullable(),
  tags: z.array(z.string()),
  lastMadeAt: z.string().datetime().nullable(),
  mealsEatenCount: z.number().int().nonnegative(),
  relevance: relevanceEvidenceSchema,
  dataQualityWarnings: z.array(z.string()),
});

export const recipeSearchOutputSchema = z.object({
  items: z.array(recipeSummarySchema).max(MAX_SEARCH_LIMIT),
  nextCursor: z.string().nullable(),
  appliedFilters: z.object({
    text: z.string().nullable(),
    ingredientsAny: z.array(z.string()),
    ingredientsAll: z.array(z.string()),
    excludeIngredients: z.array(z.string()),
    tagsAny: z.array(z.string()),
    mealTypes: z.array(z.string()),
    difficulties: z.array(z.string()),
    notMadeSince: z.string().nullable(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT),
  }),
});

const recipeHistorySchema = z.object({
  weekId: z.string(),
  weekName: z.string(),
  weekStartDate: z.string().datetime().nullable(),
  scheduledDate: z.string().datetime().nullable(),
  made: z.boolean(),
});

export const recipeDetailSchema = recipeSummarySchema.omit({ relevance: true }).extend({
  ingredients: z.array(z.string()).optional(),
  instructions: z.string().nullable().optional(),
  history: z.array(recipeHistorySchema).optional(),
  recipeLink: z.string().nullable(),
  recipeBookId: z.string().nullable(),
  page: z.string().nullable(),
});

export const recipeGetManyOutputSchema = z.object({
  items: z.array(recipeDetailSchema).max(50),
  missingIds: z.array(z.string()).max(50),
});

const weekRecipeSummarySchema = z.object({
  recipeId: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  mealType: z.string().nullable(),
  made: z.boolean(),
  order: z.number().int(),
  scheduledDate: z.string().datetime().nullable(),
});

export const weekSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  status: z.string().nullable(),
  startDate: z.string().datetime().nullable(),
  endDate: z.string().datetime().nullable(),
  weekNumber: z.number().int().nullable(),
  recipeCount: z.number().int().nonnegative(),
  recipes: z.array(weekRecipeSummarySchema).optional(),
  relevance: relevanceEvidenceSchema,
  dataQualityWarnings: z.array(z.string()),
});

export const weekSearchOutputSchema = z.object({
  items: z.array(weekSummarySchema).max(MAX_SEARCH_LIMIT),
  nextCursor: z.string().nullable(),
  appliedFilters: z.object({
    text: z.string().nullable(),
    statuses: z.array(z.string()),
    containsRecipeIds: z.array(z.string()),
    onDate: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    includeRecipes: z.boolean(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT),
  }),
});

export const weekDetailSchema = weekSummarySchema.omit({ relevance: true });

export const weekGetManyOutputSchema = z.object({
  items: z.array(weekDetailSchema).max(50),
  missingIds: z.array(z.string()).max(50),
});

export const weekRecipeMatchSchema = z.object({
  recipeId: z.string(),
  week: weekDetailSchema.omit({ recipes: true }),
  made: z.boolean(),
  order: z.number().int(),
  scheduledDate: z.string().datetime().nullable(),
});

export const weeksFindForRecipesOutputSchema = z.object({
  matches: z.array(weekRecipeMatchSchema).max(MAX_SEARCH_LIMIT),
  nextCursor: z.string().nullable(),
});

export const retrievalErrorSchema = z.object({
  code: z.enum(["INVALID_INPUT", "NO_MATCHES", "NOT_AUTHORIZED", "TRANSIENT_FAILURE"]),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export function createRetrievalResultSchema<Output extends z.ZodType>(outputSchema: Output) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: outputSchema }),
    z.object({ ok: z.literal(false), error: retrievalErrorSchema }),
  ]);
}

export const recipeSearchResultSchema = createRetrievalResultSchema(recipeSearchOutputSchema);
export const recipeGetManyResultSchema = createRetrievalResultSchema(recipeGetManyOutputSchema);
export const weekSearchResultSchema = createRetrievalResultSchema(weekSearchOutputSchema);
export const weekGetManyResultSchema = createRetrievalResultSchema(weekGetManyOutputSchema);
export const weeksFindForRecipesResultSchema = createRetrievalResultSchema(
  weeksFindForRecipesOutputSchema,
);

export type RecipeSearchInput = z.input<typeof recipeSearchInputSchema>;
export type ParsedRecipeSearchInput = z.output<typeof recipeSearchInputSchema>;
export type RecipeSearchOutput = z.infer<typeof recipeSearchOutputSchema>;
export type RecipeGetManyInput = z.input<typeof recipeGetManyInputSchema>;
export type ParsedRecipeGetManyInput = z.output<typeof recipeGetManyInputSchema>;
export type RecipeGetManyOutput = z.infer<typeof recipeGetManyOutputSchema>;
export type WeekSearchInput = z.input<typeof weekSearchInputSchema>;
export type ParsedWeekSearchInput = z.output<typeof weekSearchInputSchema>;
export type WeekSearchOutput = z.infer<typeof weekSearchOutputSchema>;
export type WeekGetManyInput = z.input<typeof weekGetManyInputSchema>;
export type ParsedWeekGetManyInput = z.output<typeof weekGetManyInputSchema>;
export type WeekGetManyOutput = z.infer<typeof weekGetManyOutputSchema>;
export type WeeksFindForRecipesInput = z.input<typeof weeksFindForRecipesInputSchema>;
export type ParsedWeeksFindForRecipesInput = z.output<typeof weeksFindForRecipesInputSchema>;
export type WeeksFindForRecipesOutput = z.infer<typeof weeksFindForRecipesOutputSchema>;
