import { z } from "zod";

export const groceryTemplateItemSchema = z.object({
  name: z.string().min(1).max(500),
  order: z.number().int().default(0),
});

export const groceryTemplateCategorySchema = z.object({
  category: z.string().min(1).max(100),
  order: z.number().int().default(0),
  items: z.array(groceryTemplateItemSchema),
});

export const createGroceryListTemplateSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2).max(255),
  template: z.array(groceryTemplateCategorySchema),
});

export const updateGroceryListTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(255).optional(),
  template: z.array(groceryTemplateCategorySchema).optional(),
});

export const deleteGroceryListTemplateSchema = z.object({
  id: z.string(),
});

export const getGroceryListTemplateByIdSchema = z.object({
  id: z.string(),
});

export const applyTemplateToWeekSchema = z.object({
  weekId: z.string(),
  templateId: z.string(),
});

export type GroceryTemplateItem = z.infer<typeof groceryTemplateItemSchema>;
export type GroceryTemplateCategory = z.infer<typeof groceryTemplateCategorySchema>;
export type CreateGroceryListTemplateSchema = z.infer<typeof createGroceryListTemplateSchema>;
export type UpdateGroceryListTemplateSchema = z.infer<typeof updateGroceryListTemplateSchema>;
export type DeleteGroceryListTemplateSchema = z.infer<typeof deleteGroceryListTemplateSchema>;
export type GetGroceryListTemplateByIdSchema = z.infer<typeof getGroceryListTemplateByIdSchema>;
export type ApplyTemplateToWeekSchema = z.infer<typeof applyTemplateToWeekSchema>;
