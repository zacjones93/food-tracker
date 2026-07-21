import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "@/db/schema";

export interface RetrievalContext {
  readonly db: DrizzleD1Database<typeof schema>;
  readonly userId: string;
  readonly teamId: string;
  readonly chatId: string;
  readonly requestId: string;
}

export interface RecipeRetrievalRecord {
  id: string;
  teamId: string;
  name: string;
  emoji: string | null;
  tags: unknown;
  mealType: string | null;
  difficulty: string | null;
  visibility: string;
  recipeLink: string | null;
  recipeBookId: string | null;
  page: string | null;
  lastMadeDate: unknown;
  mealsEatenCount: number;
  ingredients: unknown;
  recipeBody: string | null;
}

export interface WeekRetrievalRecord {
  id: string;
  teamId: string;
  name: string;
  emoji: string | null;
  status: string;
  startDate: unknown;
  endDate: unknown;
  weekNumber: number | null;
}

export interface WeekRecipeRetrievalRecord {
  id: string;
  weekId: string;
  recipeId: string;
  scheduledDate: unknown;
  order: number | null;
  made: boolean;
}

export interface RetrievalCorpus {
  recipes: RecipeRetrievalRecord[];
  weeks: WeekRetrievalRecord[];
  weekRecipes: WeekRecipeRetrievalRecord[];
}

export interface RetrievalCorpusProvider {
  load(context: RetrievalContext): Promise<RetrievalCorpus>;
}

export const RETRIEVAL_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  NO_MATCHES: "NO_MATCHES",
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  TRANSIENT_FAILURE: "TRANSIENT_FAILURE",
} as const;

export type RetrievalErrorCode =
  (typeof RETRIEVAL_ERROR_CODES)[keyof typeof RETRIEVAL_ERROR_CODES];

export interface RetrievalError {
  code: RetrievalErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type RetrievalResult<Data> =
  | { ok: true; data: Data }
  | { ok: false; error: RetrievalError };
