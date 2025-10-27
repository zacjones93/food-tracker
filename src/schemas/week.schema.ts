import { z } from "zod";

// Client-side form schema (without teamId, which is added server-side)
export const createWeekFormSchema = z.object({
  name: z.string().min(2).max(255),
  emoji: z.string().max(10).optional(),
  status: z.enum(['current', 'upcoming', 'archived']).default('upcoming'),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  weekNumber: z.number().optional(),
});

// Server-side schema with teamId
export const createWeekSchema = createWeekFormSchema.extend({
  teamId: z.string(),
});

export const updateWeekSchema = createWeekSchema.partial().extend({
  id: z.string(),
});

export const deleteWeekSchema = z.object({
  id: z.string(),
});

export const getWeekByIdSchema = z.object({
  id: z.string(),
});

export const addRecipeToWeekSchema = z.object({
  weekId: z.string(),
  recipeId: z.string(),
  order: z.number().optional(),
  scheduledDate: z.date().optional(),
});

export const removeRecipeFromWeekSchema = z.object({
  weekId: z.string(),
  recipeId: z.string(),
});

export const reorderWeekRecipesSchema = z.object({
  weekId: z.string(),
  recipeIds: z.array(z.string()),
});

export const toggleWeekRecipeMadeSchema = z.object({
  weekId: z.string(),
  recipeId: z.string(),
  made: z.boolean(),
});

export const updateWeekRecipeScheduledDateSchema = z.object({
  weekId: z.string(),
  recipeId: z.string(),
  scheduledDate: z.date().nullable(),
});

export type CreateWeekFormSchema = z.infer<typeof createWeekFormSchema>;
export type CreateWeekSchema = z.infer<typeof createWeekSchema>;
export type UpdateWeekSchema = z.infer<typeof updateWeekSchema>;
export type DeleteWeekSchema = z.infer<typeof deleteWeekSchema>;
export type GetWeekByIdSchema = z.infer<typeof getWeekByIdSchema>;
export type AddRecipeToWeekSchema = z.infer<typeof addRecipeToWeekSchema>;
export type RemoveRecipeFromWeekSchema = z.infer<typeof removeRecipeFromWeekSchema>;
export type ReorderWeekRecipesSchema = z.infer<typeof reorderWeekRecipesSchema>;
export type ToggleWeekRecipeMadeSchema = z.infer<typeof toggleWeekRecipeMadeSchema>;
export type UpdateWeekRecipeScheduledDateSchema = z.infer<typeof updateWeekRecipeScheduledDateSchema>;
