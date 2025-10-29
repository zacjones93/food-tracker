import type { Recipe, Week } from "@/db/schema";

// Tool result types - extend existing schema types where possible
export interface RecipeIngredient {
  items?: string[];
  [key: string]: unknown;
}

export interface SearchRecipesResult {
  count: number;
  recipes: Array<Pick<Recipe, 'id' | 'name' | 'emoji' | 'mealType' | 'difficulty' | 'tags' | 'lastMadeDate' | 'mealsEatenCount'>>;
}

export interface AddRecipeResult {
  success: boolean;
  recipe?: Pick<Recipe, 'id' | 'name' | 'emoji' | 'mealType' | 'difficulty'>;
  message?: string;
  error?: string;
}

export interface UpdateRecipeResult {
  success: boolean;
  message?: string;
  updates?: Record<string, unknown>;
  error?: string;
}

export interface GetRecipeResult {
  success: boolean;
  recipe?: Pick<Recipe, 'id' | 'name' | 'emoji' | 'mealType' | 'difficulty' | 'tags' | 'ingredients' | 'recipeBody' | 'recipeLink' | 'recipeBookId' | 'page' | 'lastMadeDate' | 'mealsEatenCount'>;
  error?: string;
}

export interface SearchWeeksResult {
  count: number;
  weeks: Array<
    Pick<Week, 'id' | 'name' | 'emoji' | 'status' | 'startDate' | 'endDate' | 'weekNumber'> & {
      recipes?: Array<{
        recipeId: string;
        name: string;
        emoji?: string;
        mealType?: string;
        made: boolean;
        order: number;
        scheduledDate?: Date;
      }>;
    }
  >;
}

export interface UpdateWeekResult {
  success: boolean;
  message?: string;
  updates?: Record<string, unknown>;
  error?: string;
}

export interface GetUserTimeResult {
  success: boolean;
  formattedTime?: string;
  timezone?: string;
  timeOfDay?: string;
  error?: string;
}

export interface AddRecipeToScheduleResult {
  success: boolean;
  message?: string;
  weekRecipe?: {
    id: string;
    weekId: string;
    recipeId: string;
    scheduledDate?: Date | null;
    order: number;
  };
  recipe?: {
    id: string;
    name: string;
    emoji?: string | null;
    mealType?: string | null;
  };
  week?: {
    id: string;
    name: string;
    emoji?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
  };
  error?: string;
}
