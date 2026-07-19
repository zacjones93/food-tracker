import { z } from "zod";

export const RELATION_TYPES = {
  SIDE: 'side',
  BASE: 'base',
  SAUCE: 'sauce',
  TOPPING: 'topping',
  DESSERT: 'dessert',
  CUSTOM: 'custom',
} as const;

export type RelationType = typeof RELATION_TYPES[keyof typeof RELATION_TYPES];

export const createRecipeRelationSchema = z.object({
  mainRecipeId: z.string(),
  sideRecipeId: z.string(),
  relationType: z.enum([
    RELATION_TYPES.SIDE,
    RELATION_TYPES.BASE,
    RELATION_TYPES.SAUCE,
    RELATION_TYPES.TOPPING,
    RELATION_TYPES.DESSERT,
    RELATION_TYPES.CUSTOM,
  ]),
  order: z.number().int().min(0).optional(),
});

export const deleteRecipeRelationSchema = z.object({
  mainRecipeId: z.string(),
  sideRecipeId: z.string(),
});

export const getRecipeRelationsSchema = z.object({
  recipeId: z.string(),
});

export const reorderRecipeRelationsSchema = z.object({
  mainRecipeId: z.string(),
  relationIds: z.array(z.string()),
});

export type CreateRecipeRelationInput = z.infer<typeof createRecipeRelationSchema>;
export type DeleteRecipeRelationInput = z.infer<typeof deleteRecipeRelationSchema>;
export type GetRecipeRelationsInput = z.infer<typeof getRecipeRelationsSchema>;
export type ReorderRecipeRelationsInput = z.infer<typeof reorderRecipeRelationsSchema>;
