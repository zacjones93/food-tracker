"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { groceryItemsTable, weeksTable } from "@/db/schema";
import {
  createGroceryItemSchema,
  updateGroceryItemSchema,
  deleteGroceryItemSchema,
  toggleGroceryItemSchema,
  reorderGroceryItemsSchema,
  bulkUpdateGroceryItemsSchema,
  transferGroceryItemsSchema,
  getAvailableWeeksForTransferSchema,
} from "@/schemas/grocery-item.schema";
import { eq, and, ne, desc, max } from "drizzle-orm";
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

export const transferGroceryItemsAction = createServerAction()
  .input(transferGroceryItemsSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Verify user owns both weeks
    const sourceWeek = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.sourceWeekId),
        eq(weeksTable.teamId, session.activeTeamId!),
      ),
    });

    const targetWeek = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.targetWeekId),
        eq(weeksTable.teamId, session.activeTeamId!),
      ),
    });

    if (!sourceWeek) {
      throw new ZSAError("NOT_FOUND", "Source week not found");
    }

    if (!targetWeek) {
      throw new ZSAError("NOT_FOUND", "Target week not found");
    }

    // Get max order in target week for proper ordering
    const maxOrderResult = await db
      .select({ maxOrder: max(groceryItemsTable.order) })
      .from(groceryItemsTable)
      .where(eq(groceryItemsTable.weekId, input.targetWeekId));

    const maxOrder = maxOrderResult[0]?.maxOrder ?? 0;

    // Insert into target week in batches to avoid parameter limits
    // D1 has strict limits on bulk inserts, use small batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < input.items.length; i += BATCH_SIZE) {
      const batch = input.items.slice(i, i + BATCH_SIZE);

      // Prepare items for this batch (Drizzle auto-handles id, createdAt, updatedAt)
      const newItems = batch.map((item, batchIndex) => ({
        weekId: input.targetWeekId,
        name: item.name,
        checked: false, // Always reset checked status
        order: maxOrder + i + batchIndex + 1,
        category: item.category || null, // Always include, null if undefined/empty
      }));

      await db.insert(groceryItemsTable).values(newItems);
    }

    // Revalidate both weeks
    revalidatePath(`/schedule/${input.sourceWeekId}`);
    revalidatePath(`/schedule/${input.targetWeekId}`);
    revalidatePath('/schedule');

    return {
      success: true,
      transferredCount: input.items.length,
      targetWeekId: input.targetWeekId,
    };
  });

export const getAvailableWeeksForTransferAction = createServerAction()
  .input(getAvailableWeeksForTransferSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const weeks = await db.query.weeksTable.findMany({
      where: and(
        eq(weeksTable.teamId, session.activeTeamId!),
        ne(weeksTable.id, input.excludeWeekId), // Exclude current week
      ),
      orderBy: desc(weeksTable.startDate),
      columns: {
        id: true,
        startDate: true,
        endDate: true,
        name: true,
        status: true,
      },
      limit: 20, // Only show recent/upcoming weeks
    });

    // Filter to only current and upcoming weeks
    const filteredWeeks = weeks.filter(week =>
      week.status === 'current' || week.status === 'upcoming'
    );

    return { weeks: filteredWeeks };
  });
