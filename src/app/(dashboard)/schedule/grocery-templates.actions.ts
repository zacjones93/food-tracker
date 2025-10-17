"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { groceryListTemplatesTable, groceryItemsTable, teamMembershipTable, TEAM_PERMISSIONS } from "@/db/schema";
import {
  createGroceryListTemplateSchema,
  updateGroceryListTemplateSchema,
  deleteGroceryListTemplateSchema,
  getGroceryListTemplateByIdSchema,
  applyTemplateToWeekSchema,
} from "@/schemas/grocery-template.schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { revalidatePath } from "next/cache";

export const createGroceryListTemplateAction = createServerAction()
  .input(createGroceryListTemplateSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES);

    const db = getDB();

    const [template] = await db.insert(groceryListTemplatesTable)
      .values({
        name: input.name,
        template: input.template,
        teamId: input.teamId,
        isDefault: false,
      })
      .returning();

    revalidatePath("/schedule/create");
    return { template };
  });

export const updateGroceryListTemplateAction = createServerAction()
  .input(updateGroceryListTemplateSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { id, ...updateData } = input;

    const existingTemplate = await db.query.groceryListTemplatesTable.findFirst({
      where: eq(groceryListTemplatesTable.id, id),
    });

    if (!existingTemplate) {
      throw new ZSAError("NOT_FOUND", "Template not found");
    }

    // Cannot edit default template
    if (existingTemplate.isDefault) {
      throw new ZSAError("FORBIDDEN", "Cannot edit default template");
    }

    await requirePermission(user.id, existingTemplate.teamId!, TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES);

    const [template] = await db.update(groceryListTemplatesTable)
      .set(updateData)
      .where(eq(groceryListTemplatesTable.id, id))
      .returning();

    revalidatePath("/schedule/create");
    return { template };
  });

export const deleteGroceryListTemplateAction = createServerAction()
  .input(deleteGroceryListTemplateSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const existingTemplate = await db.query.groceryListTemplatesTable.findFirst({
      where: eq(groceryListTemplatesTable.id, input.id),
    });

    if (!existingTemplate) {
      throw new ZSAError("NOT_FOUND", "Template not found");
    }

    // Cannot delete default template
    if (existingTemplate.isDefault) {
      throw new ZSAError("FORBIDDEN", "Cannot delete default template");
    }

    await requirePermission(user.id, existingTemplate.teamId!, TEAM_PERMISSIONS.DELETE_GROCERY_TEMPLATES);

    await db.delete(groceryListTemplatesTable)
      .where(eq(groceryListTemplatesTable.id, input.id));

    revalidatePath("/schedule/create");
    return { success: true };
  });

export const getGroceryListTemplateByIdAction = createServerAction()
  .input(getGroceryListTemplateByIdSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const template = await db.query.groceryListTemplatesTable.findFirst({
      where: eq(groceryListTemplatesTable.id, input.id),
    });

    if (!template) {
      throw new ZSAError("NOT_FOUND", "Template not found");
    }

    return { template };
  });

export const getGroceryListTemplatesAction = createServerAction()
  .handler(async () => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Get user's team memberships
    const memberships = await db.query.teamMembershipTable.findMany({
      where: and(
        eq(teamMembershipTable.userId, user.id),
        eq(teamMembershipTable.isActive, 1)
      ),
    });

    const teamIds = memberships.map(m => m.teamId);

    // Return templates from user's teams + default template
    const templates = await db.query.groceryListTemplatesTable.findMany({
      where: teamIds.length > 0
        ? or(
            inArray(groceryListTemplatesTable.teamId, teamIds),
            eq(groceryListTemplatesTable.isDefault, true)
          )
        : eq(groceryListTemplatesTable.isDefault, true),
      orderBy: (templates, { asc }) => [asc(templates.name)],
    });

    return { templates };
  });

export const applyTemplateToWeekAction = createServerAction()
  .input(applyTemplateToWeekSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    // Get the template
    const template = await db.query.groceryListTemplatesTable.findFirst({
      where: eq(groceryListTemplatesTable.id, input.templateId),
    });

    if (!template) {
      throw new ZSAError("NOT_FOUND", "Template not found");
    }

    // Create grocery items from template
    const groceryItems = [];
    for (const category of template.template) {
      for (const item of category.items) {
        groceryItems.push({
          weekId: input.weekId,
          name: item.name,
          category: category.category,
          order: category.order * 1000 + item.order, // Ensure category ordering
          checked: false,
        });
      }
    }

    // Insert all items
    if (groceryItems.length > 0) {
      await db.insert(groceryItemsTable).values(groceryItems);
    }

    revalidatePath(`/schedule/${input.weekId}`);
    return { success: true, itemCount: groceryItems.length };
  });
