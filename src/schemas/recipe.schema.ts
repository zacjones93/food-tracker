import { z } from "zod";

export const createRecipeSchema = z.object({
  name: z.string().min(2).max(500),
  emoji: z.string().max(10).optional(),
  tags: z.array(z.string()).optional(),
  mealType: z.string().max(50).optional(), // Allow any meal type string
  difficulty: z.string().max(20).optional(), // Allow any difficulty string
  ingredients: z.array(z.string()).optional(),
  recipeBody: z.string().optional(),
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
  tags: z.array(z.string()).optional(),
  minMealsEaten: z.coerce.number().min(0).optional(),
  maxMealsEaten: z.coerce.number().min(0).optional(),
});

export type CreateRecipeSchema = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeSchema = z.infer<typeof updateRecipeSchema>;
export type DeleteRecipeSchema = z.infer<typeof deleteRecipeSchema>;
export type GetRecipeByIdSchema = z.infer<typeof getRecipeByIdSchema>;
export type IncrementMealsEatenSchema = z.infer<typeof incrementMealsEatenSchema>;
export type GetRecipesSchema = z.infer<typeof getRecipesSchema>;
