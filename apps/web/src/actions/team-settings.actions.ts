"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { teamSettingsTable, TEAM_PERMISSIONS } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";

const recipeVisibilityModeSchema = z.enum(['all', 'team_only']);
const defaultRecipeVisibilitySchema = z.enum(['public', 'private', 'unlisted']);

export const getTeamSettingsAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    let settings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    // Create default settings if none exist
    if (!settings) {
      const [newSettings] = await db.insert(teamSettingsTable)
        .values({ teamId: input.teamId })
        .returning();
      settings = newSettings;
    }

    return { settings };
  });

export const updateRecipeVisibilityModeAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
    recipeVisibilityMode: recipeVisibilityModeSchema,
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    // Check if settings exist
    const existing = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    let settings;
    if (existing) {
      // Update existing
      [settings] = await db.update(teamSettingsTable)
        .set({ recipeVisibilityMode: input.recipeVisibilityMode })
        .where(eq(teamSettingsTable.teamId, input.teamId))
        .returning();
    } else {
      // Create new
      [settings] = await db.insert(teamSettingsTable)
        .values({
          teamId: input.teamId,
          recipeVisibilityMode: input.recipeVisibilityMode,
        })
        .returning();
    }

    return { settings };
  });

export const updateDefaultRecipeVisibilityAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
    defaultRecipeVisibility: defaultRecipeVisibilitySchema,
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    // Check if settings exist
    const existing = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    let settings;
    if (existing) {
      // Update existing
      [settings] = await db.update(teamSettingsTable)
        .set({ defaultRecipeVisibility: input.defaultRecipeVisibility })
        .where(eq(teamSettingsTable.teamId, input.teamId))
        .returning();
    } else {
      // Create new
      [settings] = await db.insert(teamSettingsTable)
        .values({
          teamId: input.teamId,
          defaultRecipeVisibility: input.defaultRecipeVisibility,
        })
        .returning();
    }

    return { settings };
  });

export const updateAutoAddIngredientsAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
    autoAddIngredientsToGrocery: z.boolean(),
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    // Check if settings exist
    const existing = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    let settings;
    if (existing) {
      // Update existing
      [settings] = await db.update(teamSettingsTable)
        .set({ autoAddIngredientsToGrocery: input.autoAddIngredientsToGrocery })
        .where(eq(teamSettingsTable.teamId, input.teamId))
        .returning();
    } else {
      // Create new
      [settings] = await db.insert(teamSettingsTable)
        .values({
          teamId: input.teamId,
          autoAddIngredientsToGrocery: input.autoAddIngredientsToGrocery,
        })
        .returning();
    }

    return { settings };
  });

export const updateAiSettingsAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
    aiEnabled: z.boolean().optional(),
    aiMonthlyBudgetUsd: z.string().optional(),
    aiMaxTokensPerRequest: z.number().int().positive().optional(),
    aiMaxRequestsPerDay: z.number().int().positive().optional(),
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    // Check if settings exist
    const existing = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    const updates: Partial<{
      aiEnabled: boolean;
      aiMonthlyBudgetUsd: string;
      aiMaxTokensPerRequest: number;
      aiMaxRequestsPerDay: number;
    }> = {};
    if (input.aiEnabled !== undefined) updates.aiEnabled = input.aiEnabled;
    if (input.aiMonthlyBudgetUsd !== undefined) updates.aiMonthlyBudgetUsd = input.aiMonthlyBudgetUsd;
    if (input.aiMaxTokensPerRequest !== undefined) updates.aiMaxTokensPerRequest = input.aiMaxTokensPerRequest;
    if (input.aiMaxRequestsPerDay !== undefined) updates.aiMaxRequestsPerDay = input.aiMaxRequestsPerDay;

    let settings;
    if (existing) {
      // Update existing
      [settings] = await db.update(teamSettingsTable)
        .set(updates)
        .where(eq(teamSettingsTable.teamId, input.teamId))
        .returning();
    } else {
      // Create new
      [settings] = await db.insert(teamSettingsTable)
        .values({
          teamId: input.teamId,
          ...updates,
        })
        .returning();
    }

    return { settings };
  });
