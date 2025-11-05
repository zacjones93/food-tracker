import { z } from "zod";

export const createGroceryItemSchema = z.object({
  weekId: z.string(),
  name: z.string().min(1).max(500),
  category: z.string().max(100).optional(),
  order: z.number().optional(),
});

export const updateGroceryItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(500).optional(),
  category: z.string().max(100).optional(),
  order: z.number().optional(),
});

export const deleteGroceryItemSchema = z.object({
  id: z.string(),
});

export const toggleGroceryItemSchema = z.object({
  id: z.string(),
  checked: z.boolean(),
});

export const reorderGroceryItemsSchema = z.object({
  weekId: z.string(),
  itemIds: z.array(z.string()),
});

export const moveGroceryItemSchema = z.object({
  id: z.string(),
  category: z.string().max(100).optional(),
  order: z.number(),
});

export const bulkUpdateGroceryItemsSchema = z.object({
  weekId: z.string(),
  updates: z.array(z.object({
    id: z.string(),
    category: z.string().max(100).optional(),
    order: z.number(),
  })),
});

export const transferGroceryItemsSchema = z.object({
  sourceWeekId: z.string(),
  targetWeekId: z.string(),
  items: z.array(z.object({
    id: z.string(),
    name: z.string().max(500),
    category: z.string().max(100).optional(),
    order: z.number(),
  })),
});

export const getAvailableWeeksForTransferSchema = z.object({
  excludeWeekId: z.string(),
});

export type CreateGroceryItemSchema = z.infer<typeof createGroceryItemSchema>;
export type UpdateGroceryItemSchema = z.infer<typeof updateGroceryItemSchema>;
export type DeleteGroceryItemSchema = z.infer<typeof deleteGroceryItemSchema>;
export type ToggleGroceryItemSchema = z.infer<typeof toggleGroceryItemSchema>;
export type ReorderGroceryItemsSchema = z.infer<typeof reorderGroceryItemsSchema>;
export type MoveGroceryItemSchema = z.infer<typeof moveGroceryItemSchema>;
export type BulkUpdateGroceryItemsSchema = z.infer<typeof bulkUpdateGroceryItemsSchema>;
export type TransferGroceryItemsSchema = z.infer<typeof transferGroceryItemsSchema>;
export type GetAvailableWeeksForTransferSchema = z.infer<typeof getAvailableWeeksForTransferSchema>;
