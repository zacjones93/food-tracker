import "server-only";
import * as z4 from "zod/v4";
import { tool } from "ai";
import { eq, like, and } from "drizzle-orm";
import { recipesTable, type Recipe } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { getSessionFromCookie } from "@/utils/auth";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@/db/schema";

export async function createRecipeTools(db: DrizzleD1Database<typeof schema>) {
  const session = await getSessionFromCookie();
  const teamId = session?.activeTeamId;
  if (!teamId) {
    throw new Error("Team ID not found");
  }



  return {
    get_recipe: tool({
      description: "Get a complete recipe by ID including all metadata, ingredients, and instructions.",
      inputSchema: z4.object({
        recipeId: z4.string().describe("Recipe ID (starts with rcp_)"),
      }),
      execute: async ({ recipeId }: { recipeId: string }) => {
        try {
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

          return {
            success: true,
            recipe: {
              id: recipe.id,
              name: recipe.name,
              emoji: recipe.emoji,
              mealType: recipe.mealType,
              difficulty: recipe.difficulty,
              tags: recipe.tags,
              ingredients: recipe.ingredients,
              recipeBody: recipe.recipeBody,
              recipeLink: recipe.recipeLink,
              recipeBookId: recipe.recipeBookId,
              page: recipe.page,
              visibility: recipe.visibility,
              lastMadeDate: recipe.lastMadeDate,
              mealsEatenCount: recipe.mealsEatenCount,
              createdAt: recipe.createdAt,
              updatedAt: recipe.updatedAt,
            },
          };
        } catch (error) {
          console.error("Error fetching recipe:", error);
          return {
            success: false,
            error: "Failed to fetch recipe",
          };
        }
      },
    }),

    search_recipes: tool({
      description: "Search recipes by name, tags, meal type, or difficulty. Returns a list of matching recipes. Search by name first then if there are too many results start filtering by meal type, difficulty, and tags.",
      inputSchema: z4.object({
        query: z4.string().optional().describe("Search query to match against recipe name"),
        mealType: z4
          .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
          .optional()
          .describe("Filter by meal type"),
        difficulty: z4
          .enum(["easy", "medium", "hard"])
          .optional()
          .describe("Filter by difficulty level"),
        tags: z4.array(z4.string()).optional().describe("Filter by tags (e.g., ['vegetarian', 'quick'])"),
        limit: z4.number().default(10).describe("Maximum number of results (default 10, max 50)"),
      }),
      execute: async ({
        query,
        mealType,
        difficulty,
        tags,
        limit = 10,
      }: {
        query?: string;
        mealType?: string;
        difficulty?: string;
        tags?: string[];
        limit?: number;
      }) => {
        const safeLimit = Math.min(limit, 50);
        const conditions = [eq(recipesTable.teamId, teamId)];

        if (query) {
          conditions.push(like(recipesTable.name, `%${query}%`));
        }
        if (mealType) {
          conditions.push(eq(recipesTable.mealType, mealType));
        }
        if (difficulty) {
          conditions.push(eq(recipesTable.difficulty, difficulty));
        }

        const results = await db.query.recipesTable.findMany({
          where: and(...conditions),
          limit: safeLimit,
        });

        let filteredResults = results;
        if (tags && tags.length > 0) {
          filteredResults = results.filter((r: Recipe) => {
            const recipeTags = r.tags || [];
            return tags.some(tag => recipeTags.includes(tag));
          });
        }

        return {
          searchParameters: {
            query: query || null,
            mealType: mealType || null,
            difficulty: difficulty || null,
            tags: tags || [],
            limit: safeLimit,
          },
          count: filteredResults.length,
          recipes: filteredResults.map((r: Recipe) => ({
            id: r.id,
            name: r.name,
            emoji: r.emoji,
            mealType: r.mealType,
            difficulty: r.difficulty,
            tags: r.tags,
            lastMadeDate: r.lastMadeDate,
            mealsEatenCount: r.mealsEatenCount,
          })),
        };
      },
    }),

    add_recipe: tool({
      description: "Create a new recipe in the database. Use this when the user wants to add a recipe.",
      inputSchema: z4.object({
        name: z4.string().min(1).describe("Recipe name"),
        emoji: z4.string().optional().describe("Emoji icon for the recipe (e.g., '🍕')"),
        mealType: z4
          .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
          .describe("Type of meal"),
        difficulty: z4
          .enum(["easy", "medium", "hard"])
          .optional()
          .describe("Difficulty level"),
        tags: z4.array(z4.string()).optional().describe("Tags for categorization (e.g., ['vegetarian', 'quick'])"),
        ingredients: z4.array(z4.string()).optional().describe("List of ingredients"),
        recipeBody: z4.string().optional().describe("Recipe instructions/notes in markdown"),
        recipeLink: z4.string().optional().describe("URL to original recipe (must be valid URL)"),
      }),
      execute: async ({
        name,
        emoji,
        mealType,
        difficulty,
        tags,
        ingredients,
        recipeBody,
        recipeLink,
      }: {
        name: string;
        emoji?: string;
        mealType: string;
        difficulty?: string;
        tags?: string[];
        ingredients?: string[];
        recipeBody?: string;
        recipeLink?: string;
      }) => {
        try {
          const now = new Date();
          const result = await db.insert(recipesTable).values({
            id: `rcp_${createId()}`,
            teamId,
            name,
            emoji: emoji || "🍽️",
            mealType,
            difficulty: difficulty || "medium",
            tags: tags || [],
            ingredients: ingredients ? ingredients.map(i => ({ items: [i] })) : [],
            recipeBody: recipeBody || "",
            recipeLink: recipeLink || null,
            visibility: "team",
            mealsEatenCount: 0,
            createdAt: now,
            updatedAt: now,
            updateCounter: 0,
          }).returning();

          const newRecipe = result[0];

          return {
            success: true,
            recipe: {
              id: newRecipe.id,
              name: newRecipe.name,
              emoji: newRecipe.emoji,
              mealType: newRecipe.mealType,
              difficulty: newRecipe.difficulty,
            },
            message: `Recipe "${name}" created successfully!`,
          };
        } catch (error) {
          console.error("Error creating recipe:", error);
          return {
            success: false,
            error: "Failed to create recipe. Please try again.",
          };
        }
      },
    }),

    update_recipe_metadata: tool({
      description: "Update recipe metadata (name, emoji, tags, meal type, difficulty). Does NOT update ingredients or recipe body.",
      inputSchema: z4.object({
        recipeId: z4.string().describe("Recipe ID (starts with rcp_)"),
        name: z4.string().optional().describe("New recipe name"),
        emoji: z4.string().optional().describe("New emoji icon"),
        mealType: z4
          .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
          .optional()
          .describe("New meal type"),
        difficulty: z4
          .enum(["easy", "medium", "hard"])
          .optional()
          .describe("New difficulty level"),
        tags: z4.array(z4.string()).optional().describe("New tags array (replaces existing tags)"),
      }),
      execute: async ({
        recipeId,
        name,
        emoji,
        mealType,
        difficulty,
        tags,
      }: {
        recipeId: string;
        name?: string;
        emoji?: string;
        mealType?: string;
        difficulty?: string;
        tags?: string[];
      }) => {
        try {
          const existing = await db.query.recipesTable.findFirst({
            where: and(
              eq(recipesTable.id, recipeId),
              eq(recipesTable.teamId, teamId)
            ),
          });

          if (!existing) {
            return {
              success: false,
              error: "Recipe not found or access denied",
            };
          }

          const updates: {
            name?: string;
            emoji?: string;
            mealType?: string;
            difficulty?: string;
            tags?: string[];
            updatedAt?: Date;
          } = {};
          if (name !== undefined) updates.name = name;
          if (emoji !== undefined) updates.emoji = emoji;
          if (mealType !== undefined) updates.mealType = mealType;
          if (difficulty !== undefined) updates.difficulty = difficulty;
          if (tags !== undefined) updates.tags = tags;

          if (Object.keys(updates).length === 0) {
            return {
              success: false,
              error: "No updates provided",
            };
          }

          updates.updatedAt = new Date();

          await db
            .update(recipesTable)
            .set(updates)
            .where(eq(recipesTable.id, recipeId));

          return {
            success: true,
            message: `Recipe "${existing.name}" updated successfully`,
            updates,
          };
        } catch (error) {
          console.error("Error updating recipe:", error);
          return {
            success: false,
            error: "Failed to update recipe",
          };
        }
      },
    }),
  };
}
