import { z } from "zod";
import { RECIPE_VISIBILITY } from "@/db/schema";
import { RELATION_TYPES } from "./recipe-relation.schema";

// Ingredient section schema
export const ingredientSectionSchema = z.object({
  title: z.string().optional(), // Optional section title like "Main Dish", "Sauce", etc.
  items: z.array(z.string()), // Array of ingredient strings
});

// Related recipe schema for create/update
export const relatedRecipeSchema = z.object({
  recipeId: z.string(),
  relationType: z.enum([
    RELATION_TYPES.SIDE,
    RELATION_TYPES.BASE,
    RELATION_TYPES.SAUCE,
    RELATION_TYPES.TOPPING,
    RELATION_TYPES.DESSERT,
    RELATION_TYPES.CUSTOM,
  ]),
});

export const createRecipeSchema = z.object({
  name: z.string().min(2).max(500),
  emoji: z.string().max(10).optional().transform(val => val === "" ? undefined : val),
  tags: z.array(z.string()).optional(),
  mealType: z.string().max(50).optional().transform(val => val === "" ? undefined : val), // Allow any meal type string
  difficulty: z.string().max(20).optional().transform(val => val === "" ? undefined : val), // Allow any difficulty string
  visibility: z.enum([RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.PRIVATE, RECIPE_VISIBILITY.UNLISTED]).default(RECIPE_VISIBILITY.PUBLIC),
  ingredients: z.array(ingredientSectionSchema).nullable().optional(),
  recipeBody: z.string().nullable().optional().transform(val => val === "" ? undefined : val),
  recipeLink: z.string().max(1000).optional().transform(val => val === "" ? undefined : val),
  recipeBookId: z.string().optional().transform(val => val === "" ? undefined : val),
  page: z.string().max(50).optional().transform(val => val === "" ? undefined : val),
  relatedRecipes: z.array(relatedRecipeSchema).optional(),
});

// Update schema - all fields optional, no defaults
// We explicitly override visibility to remove the default value from createRecipeSchema
export const updateRecipeSchema = createRecipeSchema.partial().extend({
  id: z.string(),
  visibility: z.enum([RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.PRIVATE, RECIPE_VISIBILITY.UNLISTED]).optional(),
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
  limit: z.coerce.number().min(1).max(10000).optional().default(100), // Increased for client-side filtering
  mealType: z.string().optional(), // Allow any meal type for filtering
  difficulty: z.string().optional(), // Allow any difficulty for filtering
  visibility: z.enum([RECIPE_VISIBILITY.PUBLIC, RECIPE_VISIBILITY.PRIVATE, RECIPE_VISIBILITY.UNLISTED]).optional(),
  tags: z.array(z.string()).optional(),
  seasons: z.array(z.string()).optional(), // Filter by seasonal tags
  minMealsEaten: z.coerce.number().min(0).optional(),
  maxMealsEaten: z.coerce.number().min(0).optional(),
  recipeBookId: z.string().optional(), // Filter by recipe book
  sortBy: z.enum(["newest", "mostEaten", "name"]).optional().default("newest"),
});

export type CreateRecipeSchema = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeSchema = z.infer<typeof updateRecipeSchema>;
export type DeleteRecipeSchema = z.infer<typeof deleteRecipeSchema>;
export type GetRecipeByIdSchema = z.infer<typeof getRecipeByIdSchema>;
export type IncrementMealsEatenSchema = z.infer<typeof incrementMealsEatenSchema>;
export type GetRecipesSchema = z.infer<typeof getRecipesSchema>;
