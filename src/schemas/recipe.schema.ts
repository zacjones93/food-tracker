import { z } from "zod";
import { RECIPE_VISIBILITY } from "@/db/schema";

export const createRecipeSchema = z.object({
  name: z.string().min(2).max(500),
  emoji: z.string().max(10).optional(),
  tags: z.array(z.string()).optional(),
  mealType: z.string().max(50).optional(), // Allow any meal type string
  difficulty: z.string().max(20).optional(), // Allow any difficulty string
  visibility: z.enum([RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.PRIVATE, RECIPE_VISIBILITY.UNLISTED]).default(RECIPE_VISIBILITY.PUBLIC),
  ingredients: z.array(z.string()).optional(),
  recipeBody: z.string().optional(),
  recipeLink: z.string().max(1000).optional(),
  recipeBookId: z.string().optional(),
  page: z.string().max(50).optional(),
});

export const updateRecipeSchema = createRecipeSchema.partial().extend({
  id: z.string(),
});

export const deleteRecipeSchema = z.object({
  id: z.string(),
});

export const getRecipeByIdSchema = z.object({
  id: z.string(),
});

export const incrementMealsEatenSchema = z.object({
  id: z.string(),
});

export const getRecipesSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(100),
  mealType: z.string().optional(), // Allow any meal type for filtering
  difficulty: z.string().optional(), // Allow any difficulty for filtering
  visibility: z.enum([RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.PRIVATE, RECIPE_VISIBILITY.UNLISTED]).optional(),
  tags: z.array(z.string()).optional(),
  seasons: z.array(z.string()).optional(), // Filter by seasonal tags
  minMealsEaten: z.coerce.number().min(0).optional(),
  maxMealsEaten: z.coerce.number().min(0).optional(),
  recipeBookId: z.string().optional(), // Filter by recipe book
});

export type CreateRecipeSchema = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeSchema = z.infer<typeof updateRecipeSchema>;
export type DeleteRecipeSchema = z.infer<typeof deleteRecipeSchema>;
export type GetRecipeByIdSchema = z.infer<typeof getRecipeByIdSchema>;
export type IncrementMealsEatenSchema = z.infer<typeof incrementMealsEatenSchema>;
export type GetRecipesSchema = z.infer<typeof getRecipesSchema>;
