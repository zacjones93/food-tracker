import "server-only";

/**
 * Type definitions for ingredient sections
 */
export type IngredientSection = {
  title?: string;
  items: string[];
};

/**
 * Normalizes ingredients to the new section format.
 * Handles backward compatibility with old string[] format.
 */
export function normalizeIngredients(
  ingredients: unknown
): IngredientSection[] | null {
  if (!ingredients) return null;

  // If it's already in the new format (array of objects with title/items)
  if (
    Array.isArray(ingredients) &&
    ingredients.length > 0 &&
    typeof ingredients[0] === "object" &&
    "items" in ingredients[0]
  ) {
    return ingredients as IngredientSection[];
  }

  // If it's in the old format (array of strings), convert it
  if (Array.isArray(ingredients) && ingredients.every((i) => typeof i === "string")) {
    return [{ items: ingredients as string[] }];
  }

  return null;
}

/**
 * Flattens ingredient sections into a simple string array
 */
export function flattenIngredients(
  ingredients: IngredientSection[] | null | undefined
): string[] {
  if (!ingredients) return [];
  return ingredients.flatMap((section) => section.items);
}



