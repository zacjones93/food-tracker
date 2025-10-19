"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { groceryListTemplatesTable, groceryItemsTable, TEAM_PERMISSIONS } from "@/db/schema";
import {
  createGroceryListTemplateSchema,
  updateGroceryListTemplateSchema,
  deleteGroceryListTemplateSchema,
  getGroceryListTemplateByIdSchema,
  applyTemplateToWeekSchema,
} from "@/schemas/grocery-template.schema";
import { eq, or } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { revalidatePath } from "next/cache";

export const createGroceryListTemplateAction = createServerAction()
  .input(createGroceryListTemplateSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

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
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

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
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

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
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    const template = await db.query.groceryListTemplatesTable.findFirst({
      where: eq(groceryListTemplatesTable.id, input.id),
    });

    if (!template) {
      throw new ZSAError("NOT_FOUND", "Template not found");
    }

    // Check permission if template has a team (not default)
    if (template.teamId) {
      await requirePermission(user.id, template.teamId, TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES);
    }

    return { template };
  });

export const getGroceryListTemplatesAction = createServerAction()
  .handler(async () => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    if (!session.activeTeamId) {
      throw new ZSAError("FORBIDDEN", "No active team selected");
    }

    const db = getDB();

    // Verify user has access to this team
    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES);

    // Return templates from active team + default template
    const templates = await db.query.groceryListTemplatesTable.findMany({
      where: or(
        eq(groceryListTemplatesTable.teamId, session.activeTeamId),
        eq(groceryListTemplatesTable.isDefault, true)
      ),
      orderBy: (templates, { asc }) => [asc(templates.name)],
    });

    return { templates };
  });

export const applyTemplateToWeekAction = createServerAction()
  .input(applyTemplateToWeekSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }
    const { user } = session;

    const db = getDB();

    // Get the week to verify permission
    const week = await db.query.weeksTable.findFirst({
      where: (weeks, { eq }) => eq(weeks.id, input.weekId),
    });

    if (!week) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    await requirePermission(user.id, week.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

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
