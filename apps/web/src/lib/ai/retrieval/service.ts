import type { z } from "zod/v4";

import {
  recipeGetManyInputSchema,
  recipeGetManyOutputSchema,
  recipeSearchInputSchema,
  recipeSearchOutputSchema,
  weekGetManyInputSchema,
  weekGetManyOutputSchema,
  weekSearchInputSchema,
  weekSearchOutputSchema,
  weeksFindForRecipesInputSchema,
  weeksFindForRecipesOutputSchema,
  type ParsedRecipeGetManyInput,
  type ParsedRecipeSearchInput,
  type ParsedWeekGetManyInput,
  type ParsedWeekSearchInput,
  type ParsedWeeksFindForRecipesInput,
  type RecipeGetManyInput,
  type RecipeGetManyOutput,
  type RecipeSearchInput,
  type RecipeSearchOutput,
  type WeekGetManyInput,
  type WeekGetManyOutput,
  type WeekSearchInput,
  type WeekSearchOutput,
  type WeeksFindForRecipesInput,
  type WeeksFindForRecipesOutput,
} from "./contracts";
import {
  findWeeksForRecipes,
  getManyRecipes,
  getManyWeeks,
  searchRecipes,
  searchWeeks,
} from "./engine";
import type {
  RetrievalContext,
  RetrievalCorpus,
  RetrievalCorpusProvider,
  RetrievalResult,
} from "./types";

export interface RecipeRetrievalService {
  search(input: RecipeSearchInput): Promise<RetrievalResult<RecipeSearchOutput>>;
  getMany(input: RecipeGetManyInput): Promise<RetrievalResult<RecipeGetManyOutput>>;
}

export interface WeekRetrievalService {
  search(input: WeekSearchInput): Promise<RetrievalResult<WeekSearchOutput>>;
  getMany(input: WeekGetManyInput): Promise<RetrievalResult<WeekGetManyOutput>>;
  findForRecipes(
    input: WeeksFindForRecipesInput,
  ): Promise<RetrievalResult<WeeksFindForRecipesOutput>>;
}

export interface RetrievalService {
  recipes: RecipeRetrievalService;
  weeks: WeekRetrievalService;
}

export function createRetrievalService<Database>({
  context,
  provider,
}: {
  context: RetrievalContext<Database>;
  provider: RetrievalCorpusProvider<Database>;
}): RetrievalService {
  let corpusPromise: Promise<RetrievalCorpus> | null = null;
  const loadCorpus = () => {
    corpusPromise ??= provider.load(context);
    return corpusPromise;
  };

  return {
    recipes: {
      search: (input) =>
        executeRetrieval<RecipeSearchInput, ParsedRecipeSearchInput, RecipeSearchOutput>({
          context,
          input,
          inputSchema: recipeSearchInputSchema,
          outputSchema: recipeSearchOutputSchema,
          loadCorpus,
          retrieve: ({ corpus, parsedInput }) =>
            searchRecipes({ corpus, teamId: context.teamId, input: parsedInput }),
        }),
      getMany: (input) =>
        executeRetrieval<RecipeGetManyInput, ParsedRecipeGetManyInput, RecipeGetManyOutput>({
          context,
          input,
          inputSchema: recipeGetManyInputSchema,
          outputSchema: recipeGetManyOutputSchema,
          loadCorpus,
          retrieve: ({ corpus, parsedInput }) =>
            getManyRecipes({ corpus, teamId: context.teamId, input: parsedInput }),
        }),
    },
    weeks: {
      search: (input) =>
        executeRetrieval<WeekSearchInput, ParsedWeekSearchInput, WeekSearchOutput>({
          context,
          input,
          inputSchema: weekSearchInputSchema,
          outputSchema: weekSearchOutputSchema,
          loadCorpus,
          retrieve: ({ corpus, parsedInput }) =>
            searchWeeks({ corpus, teamId: context.teamId, input: parsedInput }),
        }),
      getMany: (input) =>
        executeRetrieval<WeekGetManyInput, ParsedWeekGetManyInput, WeekGetManyOutput>({
          context,
          input,
          inputSchema: weekGetManyInputSchema,
          outputSchema: weekGetManyOutputSchema,
          loadCorpus,
          retrieve: ({ corpus, parsedInput }) =>
            getManyWeeks({ corpus, teamId: context.teamId, input: parsedInput }),
        }),
      findForRecipes: (input) =>
        executeRetrieval<
          WeeksFindForRecipesInput,
          ParsedWeeksFindForRecipesInput,
          WeeksFindForRecipesOutput
        >({
          context,
          input,
          inputSchema: weeksFindForRecipesInputSchema,
          outputSchema: weeksFindForRecipesOutputSchema,
          loadCorpus,
          retrieve: ({ corpus, parsedInput }) =>
            findWeeksForRecipes({ corpus, teamId: context.teamId, input: parsedInput }),
        }),
    },
  };
}

async function executeRetrieval<RawInput, ParsedInput, Output>({
  context,
  input,
  inputSchema,
  outputSchema,
  loadCorpus,
  retrieve,
}: {
  context: RetrievalContext<unknown>;
  input: RawInput;
  inputSchema: z.ZodType<ParsedInput, RawInput>;
  outputSchema: z.ZodType<Output>;
  loadCorpus: () => Promise<RetrievalCorpus>;
  retrieve: ({
    corpus,
    parsedInput,
  }: {
    corpus: RetrievalCorpus;
    parsedInput: ParsedInput;
  }) => RetrievalResult<Output>;
}): Promise<RetrievalResult<Output>> {
  if (!hasAuthorizedContext(context)) {
    return {
      ok: false,
      error: {
        code: "NOT_AUTHORIZED",
        message: "Retrieval requires an authorized user, team, chat, and request context",
        retryable: false,
      },
    };
  }

  const inputResult = inputSchema.safeParse(input);
  if (!inputResult.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Retrieval input is invalid",
        retryable: false,
        details: {
          issues: inputResult.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
    };
  }

  try {
    const result = retrieve({ corpus: await loadCorpus(), parsedInput: inputResult.data });
    if (!result.ok) return result;

    const outputResult = outputSchema.safeParse(result.data);
    if (outputResult.success) return { ok: true, data: outputResult.data };

    return {
      ok: false,
      error: {
        code: "TRANSIENT_FAILURE",
        message: "Retrieval produced an invalid result",
        retryable: true,
        details: { requestId: context.requestId },
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "TRANSIENT_FAILURE",
        message: "Retrieval is temporarily unavailable",
        retryable: true,
        details: { requestId: context.requestId },
      },
    };
  }
}

function hasAuthorizedContext(context: RetrievalContext<unknown>): boolean {
  return Boolean(
    context.db &&
      context.userId.trim() &&
      context.teamId.trim() &&
      context.chatId.trim() &&
      context.requestId.trim(),
  );
}
