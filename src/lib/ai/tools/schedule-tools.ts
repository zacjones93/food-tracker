import "server-only";
import * as z4 from "zod/v4";
import { tool } from "ai";
import { weeksTable, weekRecipesTable, recipesTable, type Week, type WeekRecipe } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@/db/schema";

export async function createScheduleTools(db: DrizzleD1Database<typeof schema>) {
  const session = await getSessionFromCookie();
  const teamId = session?.activeTeamId;
  if (!teamId) {
    throw new Error("Team ID not found");
  }

  return {
    search_weeks: tool({
      description: "Search weeks/meal schedules by status, date range, or name. Returns matching weeks with their assigned recipes.",
      inputSchema: z4.object({
        status: z4
          .enum(["current", "upcoming", "archived"])
          .optional()
          .describe("Filter by week status"),
        query: z4.string().optional().describe("Search query for week name"),
        includeRecipes: z4.boolean().default(true).describe("Include assigned recipes in results"),
        limit: z4.number().default(10).describe("Maximum number of results (default 10, max 20)"),
      }),
      execute: async ({
        status,
        query,
        includeRecipes = true,
        limit = 10,
      }: {
        status?: string;
        query?: string;
        includeRecipes?: boolean;
        limit?: number;
      }) => {
        const safeLimit = Math.min(limit, 20);
        const conditions = [eq(weeksTable.teamId, teamId)];

        if (status) {
          conditions.push(eq(weeksTable.status, status));
        }

        const results = await db.query.weeksTable.findMany({
          where: and(...conditions),
          limit: safeLimit,
          orderBy: (table, { desc }) => [desc(table.startDate)],
          with: includeRecipes
            ? {
                recipes: {
                  with: {
                    recipe: true,
                  },
                },
              }
            : undefined,
        });

        type WeekWithRecipes = Week & {
          recipes?: Array<WeekRecipe & { recipe: { id: string; name: string; emoji: string | null; mealType: string | null } }>;
        };

        let filteredResults = results as WeekWithRecipes[];
        if (query) {
          filteredResults = results.filter((w: WeekWithRecipes) =>
            w.name.toLowerCase().includes(query.toLowerCase())
          );
        }

        return {
          searchParameters: {
            status: status || null,
            query: query || null,
            includeRecipes,
            limit: safeLimit,
          },
          count: filteredResults.length,
          weeks: filteredResults.map((w: WeekWithRecipes) => ({
            id: w.id,
            name: w.name,
            emoji: w.emoji,
            status: w.status,
            startDate: w.startDate,
            endDate: w.endDate,
            weekNumber: w.weekNumber,
            recipes: includeRecipes && w.recipes
              ? w.recipes.map((wr) => ({
                  recipeId: wr.recipe.id,
                  name: wr.recipe.name,
                  emoji: wr.recipe.emoji,
                  mealType: wr.recipe.mealType,
                  made: wr.made,
                  order: wr.order,
                  scheduledDate: wr.scheduledDate,
                }))
              : undefined,
          })),
        };
      },
    }),

    update_week: tool({
      description: "Update week metadata (name, emoji, status, dates). Does NOT modify assigned recipes.",
      inputSchema: z4.object({
        weekId: z4.string().describe("Week ID (starts with wk_)"),
        name: z4.string().optional().describe("New week name"),
        emoji: z4.string().optional().describe("New emoji icon"),
        status: z4
          .enum(["current", "upcoming", "archived"])
          .optional()
          .describe("New status"),
        startDate: z4.string().optional().describe("New start date (ISO format: YYYY-MM-DD)"),
        endDate: z4.string().optional().describe("New end date (ISO format: YYYY-MM-DD)"),
      }),
      execute: async ({
        weekId,
        name,
        emoji,
        status,
        startDate,
        endDate,
      }: {
        weekId: string;
        name?: string;
        emoji?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
      }) => {
        try {
          const existing = await db.query.weeksTable.findFirst({
            where: and(eq(weeksTable.id, weekId), eq(weeksTable.teamId, teamId)),
          });

          if (!existing) {
            return {
              success: false,
              error: "Week not found or access denied",
            };
          }

          const updates: {
            name?: string;
            emoji?: string | null;
            status?: string;
            startDate?: Date;
            endDate?: Date;
            updatedAt?: Date;
          } = {};
          if (name !== undefined) updates.name = name;
          if (emoji !== undefined) updates.emoji = emoji;
          if (status !== undefined) updates.status = status;
          if (startDate !== undefined) updates.startDate = new Date(startDate);
          if (endDate !== undefined) updates.endDate = new Date(endDate);

          if (Object.keys(updates).length === 0) {
            return {
              success: false,
              error: "No updates provided",
            };
          }

          updates.updatedAt = new Date();

          await db.update(weeksTable).set(updates).where(eq(weeksTable.id, weekId));

          return {
            success: true,
            message: `Week "${existing.name}" updated successfully`,
            updates,
          };
        } catch (error) {
          console.error("Error updating week:", error);
          return {
            success: false,
            error: "Failed to update week",
          };
        }
      },
    }),

    add_recipe_to_schedule: tool({
      description: "Add a recipe to a week's schedule. If the user does not specify a specific day to schedule the recipe, ask them if they want to schedule it for a specific day within the week's date range. The recipe will be added to the week regardless, but scheduling it for a specific day helps with meal planning.",
      inputSchema: z4.object({
        weekId: z4.string().describe("Week ID (starts with wk_)"),
        recipeId: z4.string().describe("Recipe ID (starts with rcp_)"),
        scheduledDate: z4.string().optional().describe("ISO date string (YYYY-MM-DD) to schedule the recipe for a specific day. If not provided, recipe is added to week without a specific day."),
        order: z4.number().optional().describe("Display order within the day (default 0)"),
      }),
      execute: async ({
        weekId,
        recipeId,
        scheduledDate,
        order,
      }: {
        weekId: string;
        recipeId: string;
        scheduledDate?: string;
        order?: number;
      }) => {
        try {
          // Verify week exists and belongs to team
          const week = await db.query.weeksTable.findFirst({
            where: and(eq(weeksTable.id, weekId), eq(weeksTable.teamId, teamId)),
          });

          if (!week) {
            return {
              success: false,
              error: "Week not found or access denied",
            };
          }

          // Verify recipe exists and belongs to team
          const recipe = await db.query.recipesTable.findFirst({
            where: and(
              eq(recipesTable.id, recipeId),
              eq(recipesTable.teamId, teamId)
            ),
          });

          if (!recipe) {
            return {
              success: false,
              error: "Recipe not found or access denied",
            };
          }

          // Check if recipe is already in this week
          const existing = await db.query.weekRecipesTable.findFirst({
            where: and(
              eq(weekRecipesTable.weekId, weekId),
              eq(weekRecipesTable.recipeId, recipeId)
            ),
          });

          if (existing) {
            return {
              success: false,
              error: `Recipe "${recipe.name}" is already in week "${week.name}"`,
            };
          }

          // Add recipe to week
          const now = new Date();

          // Parse scheduledDate correctly to avoid timezone issues
          let parsedScheduledDate: Date | null = null;
          if (scheduledDate) {
            const [year, month, day] = scheduledDate.split('-');
            parsedScheduledDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          }

          const result = await db.insert(weekRecipesTable).values({
            weekId,
            recipeId,
            scheduledDate: parsedScheduledDate,
            order: order ?? 0,
            made: false,
            createdAt: now,
          }).returning();

          const weekRecipe = result[0];

          // Format the date correctly by parsing the ISO string components
          const formatDate = (isoDateString: string) => {
            const [year, month, day] = isoDateString.split('-');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString();
          };

          return {
            success: true,
            message: scheduledDate
              ? `Recipe "${recipe.name}" added to "${week.name}" and scheduled for ${formatDate(scheduledDate)}`
              : `Recipe "${recipe.name}" added to "${week.name}" (no specific day scheduled)`,
            weekRecipe: {
              id: weekRecipe.id,
              weekId: weekRecipe.weekId,
              recipeId: weekRecipe.recipeId,
              scheduledDate: weekRecipe.scheduledDate,
              order: weekRecipe.order,
            },
            recipe: {
              id: recipe.id,
              name: recipe.name,
              emoji: recipe.emoji,
              mealType: recipe.mealType,
            },
            week: {
              id: week.id,
              name: week.name,
              emoji: week.emoji,
              startDate: week.startDate,
              endDate: week.endDate,
            },
          };
        } catch (error) {
          console.error("Error adding recipe to schedule:", error);
          return {
            success: false,
            error: "Failed to add recipe to schedule",
          };
        }
      },
    }),
  };
}
