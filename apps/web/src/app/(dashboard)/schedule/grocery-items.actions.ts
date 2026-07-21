"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { groceryItemsTable, weeksTable, TEAM_PERMISSIONS } from "@/db/schema";
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
import { eq, and, ne, desc, max, inArray } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/utils/team-auth";

export const createGroceryItemAction = createServerAction()
  .input(createGroceryItemSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

    const db = getDB();

    const week = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.weekId),
        eq(weeksTable.teamId, session.activeTeamId),
      ),
    });
    if (!week) throw new ZSAError("NOT_FOUND", "Week not found in the active team");

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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

    const db = getDB();
    const { id, ...updateData } = input;

    const existing = await db.query.groceryItemsTable.findFirst({
      where: eq(groceryItemsTable.id, id),
      with: { week: true },
    });
    if (!existing || existing.week.teamId !== session.activeTeamId) {
      throw new ZSAError("NOT_FOUND", "Grocery item not found in the active team");
    }

    const [groceryItem] = await db.update(groceryItemsTable)
      .set(updateData)
      .where(and(eq(groceryItemsTable.id, id), eq(groceryItemsTable.weekId, existing.weekId)))
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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

    const db = getDB();

    // Get item to find weekId for revalidation
    const item = await db.query.groceryItemsTable.findFirst({
      where: eq(groceryItemsTable.id, input.id),
      with: { week: true },
    });

    if (!item || item.week.teamId !== session.activeTeamId) {
      throw new ZSAError("NOT_FOUND", "Grocery item not found in the active team");
    }

    await db.delete(groceryItemsTable)
      .where(and(eq(groceryItemsTable.id, input.id), eq(groceryItemsTable.weekId, item.weekId)));

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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

    const db = getDB();

    const existing = await db.query.groceryItemsTable.findFirst({
      where: eq(groceryItemsTable.id, input.id),
      with: { week: true },
    });
    if (!existing || existing.week.teamId !== session.activeTeamId) {
      throw new ZSAError("NOT_FOUND", "Grocery item not found in the active team");
    }

    const [groceryItem] = await db.update(groceryItemsTable)
      .set({ checked: input.checked })
      .where(and(eq(groceryItemsTable.id, input.id), eq(groceryItemsTable.weekId, existing.weekId)))
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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

    const db = getDB();

    const week = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.weekId),
        eq(weeksTable.teamId, session.activeTeamId),
      ),
    });
    if (!week) throw new ZSAError("NOT_FOUND", "Week not found in the active team");

    const ownedItems = await db.query.groceryItemsTable.findMany({
      where: and(
        eq(groceryItemsTable.weekId, input.weekId),
        inArray(groceryItemsTable.id, input.itemIds),
      ),
      columns: { id: true },
    });
    if (ownedItems.length !== input.itemIds.length) {
      throw new ZSAError("FORBIDDEN", "Every grocery item must belong to the active team's week");
    }

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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

    const db = getDB();

    const week = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.weekId),
        eq(weeksTable.teamId, session.activeTeamId),
      ),
    });
    if (!week) throw new ZSAError("NOT_FOUND", "Week not found in the active team");

    const updateIds = input.updates.map((update) => update.id);
    const ownedItems = await db.query.groceryItemsTable.findMany({
      where: and(
        eq(groceryItemsTable.weekId, input.weekId),
        inArray(groceryItemsTable.id, updateIds),
      ),
      columns: { id: true },
    });
    if (ownedItems.length !== updateIds.length) {
      throw new ZSAError("FORBIDDEN", "Every grocery item must belong to the active team's week");
    }

    // Update each item with its new category and order
    for (const update of input.updates) {
      await db.update(groceryItemsTable)
        .set({
          category: update.category,
          order: update.order,
        })
        .where(and(
          eq(groceryItemsTable.id, update.id),
          eq(groceryItemsTable.weekId, input.weekId),
        ));
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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.EDIT_SCHEDULES,
    );

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
    if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");

    await requirePermission(
      session.user.id,
      session.activeTeamId,
      TEAM_PERMISSIONS.ACCESS_SCHEDULES,
    );

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
