import { DynamicWorkerExecutor, type ResolvedProvider } from "@cloudflare/codemode";

import { CODE_MODE_ACCEPTANCE_EXAMPLES } from "./code-mode-contract";

interface LoaderSmokeEnv {
  LOADER: WorkerLoader;
}

interface SearchInput {
  text?: unknown;
  mealTypes?: unknown;
  onDate?: unknown;
}

function readSearchInput(input: unknown): SearchInput {
  if (typeof input !== "object" || input === null) return {};
  return {
    text: "text" in input ? input.text : undefined,
    mealTypes: "mealTypes" in input ? input.mealTypes : undefined,
    onDate: "onDate" in input ? input.onDate : undefined,
  };
}

function recipeSummary({ id, name }: { id: string; name: string }) {
  return {
    id,
    name,
    emoji: null,
    mealType: "Dinner",
    difficulty: null,
    tags: [],
    lastMadeAt: null,
    mealsEatenCount: 0,
    relevance: {
      score: 1,
      matchedFields: ["name"],
      matchedTerms: [name.toLowerCase()],
      matchedFilters: [],
    },
    dataQualityWarnings: [],
  };
}

async function searchRecipeFixture(...args: unknown[]) {
  const input = args[0];
  const parsed = readSearchInput(input);
  if (parsed.text === "chicken") {
    if (!Array.isArray(parsed.mealTypes) || parsed.mealTypes[0] !== "Dinner") {
      throw new Error("Chicken acceptance fixture requires title-case Dinner");
    }
    return {
      ok: true,
      data: {
        items: [
          recipeSummary({ id: "chicken-1", name: "Chicken One" }),
          recipeSummary({ id: "chicken-2", name: "Chicken Two" }),
          recipeSummary({ id: "chicken-3", name: "Chicken Three" }),
        ],
        nextCursor: null,
        appliedFilters: {},
      },
    };
  }
  if (parsed.text === "Cilantro Lime Chicken Wings") {
    return {
      ok: true,
      data: {
        items: [recipeSummary({ id: "wings", name: parsed.text })],
        nextCursor: null,
        appliedFilters: {},
      },
    };
  }
  if (parsed.text === "Paper-wrapped Chicken") {
    return {
      ok: true,
      data: {
        items: [recipeSummary({ id: "paper", name: parsed.text })],
        nextCursor: null,
        appliedFilters: {},
      },
    };
  }
  return {
    ok: false,
    error: { code: "NO_MATCHES", message: "No fixture match", retryable: false },
  };
}

async function getRecipeFixtures(...args: unknown[]) {
  const input = args[0];
  if (typeof input !== "object" || input === null || !("ids" in input)) {
    throw new Error("Recipe detail fixture requires ids");
  }
  if (!Array.isArray(input.ids) || input.ids.join(",") !== "wings,paper") {
    throw new Error("Recipe detail fixture received unexpected ids");
  }
  return {
    ok: true,
    data: {
      items: [
        { ...recipeSummary({ id: "wings", name: "Cilantro Lime Chicken Wings" }), ingredients: ["lime"], instructions: "Bake", recipeLink: null, recipeBookId: null, page: null },
        { ...recipeSummary({ id: "paper", name: "Paper-wrapped Chicken" }), ingredients: ["paper"], instructions: "Wrap", recipeLink: null, recipeBookId: null, page: null },
      ],
      missingIds: [],
    },
  };
}

async function searchWeekFixture(...args: unknown[]) {
  const input = args[0];
  const parsed = readSearchInput(input);
  if (parsed.onDate !== "2026-07-21") {
    throw new Error("Current schedule fixture requires the acceptance date");
  }
  return {
    ok: true,
    data: {
      items: [{
        id: "current-week",
        name: "Jul 21-27",
        emoji: null,
        status: "current",
        startDate: "2026-07-21T00:00:00.000Z",
        endDate: "2026-07-27T23:59:59.000Z",
        weekNumber: 30,
        recipeCount: 1,
        recipes: [{ recipeId: "chicken-1", name: "Chicken One", emoji: null, mealType: "Dinner", made: false, order: 1, scheduledDate: null }],
        relevance: { score: 1, matchedFields: ["dateRange"], matchedTerms: [], matchedFilters: ["onDate"] },
        dataQualityWarnings: [],
      }],
      nextCursor: null,
      appliedFilters: {},
    },
  };
}

function hasArrayLength(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length;
}

function hasDetailItems(value: unknown): boolean {
  return typeof value === "object" && value !== null &&
    "items" in value && hasArrayLength(value.items, 2);
}

export default {
  async fetch(_request: Request, env: LoaderSmokeEnv): Promise<Response> {
    const loaderType = typeof env.LOADER?.load;
    if (loaderType !== "function") {
      return Response.json({ ok: false, binding: loaderType }, { status: 500 });
    }

    const executor = new DynamicWorkerExecutor({
      loader: env.LOADER,
      globalOutbound: null,
      timeout: 5_000,
    });
    const providers: ResolvedProvider[] = [
      {
        name: "recipes",
        fns: {
          search: searchRecipeFixture,
          getMany: getRecipeFixtures,
        },
      },
      {
        name: "weeks",
        fns: {
          search: searchWeekFixture,
        },
      },
    ];

    const chickenSearch = await executor.execute(
      CODE_MODE_ACCEPTANCE_EXAMPLES.chickenSearch,
      providers,
    );
    const currentSchedule = await executor.execute(
      CODE_MODE_ACCEPTANCE_EXAMPLES.currentSchedule,
      providers,
    );
    const twoRecipeComparison = await executor.execute(
      CODE_MODE_ACCEPTANCE_EXAMPLES.twoRecipeComparison,
      providers,
    );
    const cases = {
      chickenSearch: !chickenSearch.error && hasArrayLength(chickenSearch.result, 3),
      currentSchedule: !currentSchedule.error && hasArrayLength(currentSchedule.result, 1),
      twoRecipeComparison:
        !twoRecipeComparison.error && hasDetailItems(twoRecipeComparison.result),
    };
    const ok = Object.values(cases).every(Boolean);
    return Response.json({
      ok,
      binding: loaderType,
      cases,
      errors: {
        chickenSearch: Boolean(chickenSearch.error),
        currentSchedule: Boolean(currentSchedule.error),
        twoRecipeComparison: Boolean(twoRecipeComparison.error),
      },
    }, { status: ok ? 200 : 500 });
  },
};
