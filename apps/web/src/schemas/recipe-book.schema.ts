import { z } from "zod";

export const createRecipeBookSchema = z.object({
  name: z.string().min(2).max(500),
});

export const updateRecipeBookSchema = createRecipeBookSchema.partial().extend({
  id: z.string(),
});

export const deleteRecipeBookSchema = z.object({
  id: z.string(),
});

export const getRecipeBookByIdSchema = z.object({
  id: z.string(),
});

export const getRecipeBooksSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(100),
});

export type CreateRecipeBookSchema = z.infer<typeof createRecipeBookSchema>;
export type UpdateRecipeBookSchema = z.infer<typeof updateRecipeBookSchema>;
export type DeleteRecipeBookSchema = z.infer<typeof deleteRecipeBookSchema>;
export type GetRecipeBookByIdSchema = z.infer<typeof getRecipeBookByIdSchema>;
export type GetRecipeBooksSchema = z.infer<typeof getRecipeBooksSchema>;
