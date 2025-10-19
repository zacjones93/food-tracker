"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { groceryItemsTable } from "@/db/schema";
import {
  createGroceryItemSchema,
  updateGroceryItemSchema,
  deleteGroceryItemSchema,
  toggleGroceryItemSchema,
  reorderGroceryItemsSchema,
  bulkUpdateGroceryItemsSchema,
} from "@/schemas/grocery-item.schema";
import { eq, and } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { revalidatePath } from "next/cache";

export const createGroceryItemAction = createServerAction()
  .input(createGroceryItemSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Get the max order for this week
    const items = await db.query.groceryItemsTable.findMany({
      where: eq(groceryItemsTable.weekId, input.weekId),
    });

    const maxOrder = items.reduce((max, item) => Math.max(max, item.order ?? 0), -1);

    const [groceryItem] = await db.insert(groceryItemsTable)
      .values({
        weekId: input.weekId,
        name: input.name,
        category: input.category,
        order: input.order ?? maxOrder + 1,
      })
      .returning();

    revalidatePath(`/schedule/${input.weekId}`);

    return { groceryItem };
  });

export const updateGroceryItemAction = createServerAction()
  .input(updateGroceryItemSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { id, ...updateData } = input;

    const [groceryItem] = await db.update(groceryItemsTable)
      .set(updateData)
      .where(eq(groceryItemsTable.id, id))
      .returning();

    if (!groceryItem) {
      throw new ZSAError("NOT_FOUND", "Grocery item not found");
    }

    revalidatePath(`/schedule/${groceryItem.weekId}`);

    return { groceryItem };
  });

export const deleteGroceryItemAction = createServerAction()
  .input(deleteGroceryItemSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Get item to find weekId for revalidation
    const item = await db.query.groceryItemsTable.findFirst({
      where: eq(groceryItemsTable.id, input.id),
    });

    await db.delete(groceryItemsTable)
      .where(eq(groceryItemsTable.id, input.id));

    if (item) {
      revalidatePath(`/schedule/${item.weekId}`);
    }

    return { success: true };
  });

export const toggleGroceryItemAction = createServerAction()
  .input(toggleGroceryItemSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const [groceryItem] = await db.update(groceryItemsTable)
      .set({ checked: input.checked })
      .where(eq(groceryItemsTable.id, input.id))
      .returning();

    if (!groceryItem) {
      throw new ZSAError("NOT_FOUND", "Grocery item not found");
    }

    revalidatePath(`/schedule/${groceryItem.weekId}`);

    return { groceryItem };
  });

export const reorderGroceryItemsAction = createServerAction()
  .input(reorderGroceryItemsSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Update order for each item
    for (let i = 0; i < input.itemIds.length; i++) {
      await db.update(groceryItemsTable)
        .set({ order: i })
        .where(
          and(
            eq(groceryItemsTable.weekId, input.weekId),
            eq(groceryItemsTable.id, input.itemIds[i])
          )
        );
    }

    return { success: true };
  });

export const bulkUpdateGroceryItemsAction = createServerAction()
  .input(bulkUpdateGroceryItemsSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Update each item with its new category and order
    for (const update of input.updates) {
      await db.update(groceryItemsTable)
        .set({
          category: update.category,
          order: update.order,
        })
        .where(eq(groceryItemsTable.id, update.id));
    }

    revalidatePath(`/schedule/${input.weekId}`);

    return { success: true };
  });
