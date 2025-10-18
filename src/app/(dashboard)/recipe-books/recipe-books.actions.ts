"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { recipeBooksTable, recipesTable } from "@/db/schema";
import {
  createRecipeBookSchema,
  updateRecipeBookSchema,
  deleteRecipeBookSchema,
  getRecipeBookByIdSchema,
  getRecipeBooksSchema,
} from "@/schemas/recipe-book.schema";
import { eq, like } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";

export const createRecipeBookAction = createServerAction()
  .input(createRecipeBookSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const [recipeBook] = await db.insert(recipeBooksTable)
      .values({
        name: input.name,
      })
      .returning();

    return { recipeBook };
  });

export const updateRecipeBookAction = createServerAction()
  .input(updateRecipeBookSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { id, ...updateData } = input;

    const [recipeBook] = await db.update(recipeBooksTable)
      .set(updateData)
      .where(eq(recipeBooksTable.id, id))
      .returning();

    if (!recipeBook) {
      throw new ZSAError("NOT_FOUND", "Recipe book not found");
    }

    return { recipeBook };
  });

export const deleteRecipeBookAction = createServerAction()
  .input(deleteRecipeBookSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    await db.delete(recipeBooksTable)
      .where(eq(recipeBooksTable.id, input.id));

    return { success: true };
  });

export const getRecipeBookByIdAction = createServerAction()
  .input(getRecipeBookByIdSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();

    const recipeBook = await db.query.recipeBooksTable.findFirst({
      where: eq(recipeBooksTable.id, input.id),
      with: {
        recipes: true,
      },
    });

    if (!recipeBook) {
      throw new ZSAError("NOT_FOUND", "Recipe book not found");
    }

    // Sort recipes by page number (numeric), then by name
    // Page is a text field, so we need to parse it for proper numeric sorting
    const sortedRecipes = recipeBook.recipes.sort((a, b) => {
      const pageA = a.page ? parseInt(a.page, 10) : Number.MAX_SAFE_INTEGER;
      const pageB = b.page ? parseInt(b.page, 10) : Number.MAX_SAFE_INTEGER;

      // If both pages are valid numbers, compare numerically
      if (!isNaN(pageA) && !isNaN(pageB) && pageA !== pageB) {
        return pageA - pageB;
      }

      // Fall back to name comparison
      return (a.name || "").localeCompare(b.name || "");
    });

    return { recipeBook: { ...recipeBook, recipes: sortedRecipes } };
  });

export const getRecipeBooksAction = createServerAction()
  .input(getRecipeBooksSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    const db = getDB();
    const { search, page, limit } = input;

    // Build WHERE conditions
    const whereClause = search ? like(recipeBooksTable.name, `%${search}%`) : undefined;

    // Fetch all recipe books with recipe counts (need all to sort by count)
    const allRecipeBooks = await db.query.recipeBooksTable.findMany({
      where: whereClause,
      with: {
        recipes: {
          columns: { id: true },
        },
      },
    });

    // Transform to include recipe count and sort by count descending
    const recipeBooksWithCount = allRecipeBooks
      .map(book => ({
        ...book,
        recipeCount: book.recipes.length,
        recipes: undefined, // Remove the recipes array from the response
      }))
      .sort((a, b) => b.recipeCount - a.recipeCount);

    const total = recipeBooksWithCount.length;

    // Apply pagination after sorting
    const paginatedBooks = recipeBooksWithCount.slice(
      (page - 1) * limit,
      page * limit
    );

    return {
      recipeBooks: paginatedBooks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    };
  });
