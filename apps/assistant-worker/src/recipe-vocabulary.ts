import {
  ASSISTANT_TEAM_PERMISSIONS,
  assertAssistantTeamPermission,
} from "./authorization";
import type { AssistantRequestContext } from "./context";

const VOCABULARY_LIMITS = {
  emojis: 50,
  mealTypes: 50,
  tags: 100,
} as const;

export interface RecipeVocabularyValue {
  count: number;
  value: string;
}

export interface RecipeVocabulary {
  emojis: RecipeVocabularyValue[];
  mealTypes: RecipeVocabularyValue[];
  tags: RecipeVocabularyValue[];
}

interface RecipeVocabularyRow {
  emoji: string | null;
  mealType: string | null;
  tags: string | null;
}

interface CountedVariants {
  count: number;
  variants: Map<string, number>;
}

function addValue({
  counts,
  value,
  maxLength,
}: {
  counts: Map<string, CountedVariants>;
  value: unknown;
  maxLength: number;
}): void {
  if (typeof value !== "string") return;
  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue.length > maxLength) return;
  const key = trimmedValue.toLocaleLowerCase("en-US");
  const current = counts.get(key) ?? { count: 0, variants: new Map<string, number>() };
  current.count += 1;
  current.variants.set(trimmedValue, (current.variants.get(trimmedValue) ?? 0) + 1);
  counts.set(key, current);
}

function rankedValues({
  counts,
  limit,
}: {
  counts: Map<string, CountedVariants>;
  limit: number;
}): RecipeVocabularyValue[] {
  return [...counts.values()]
    .map(({ count, variants }) => ({
      count,
      value: [...variants.entries()]
        .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "",
    }))
    .filter(({ value }) => Boolean(value))
    .sort((left, right) =>
      right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit);
}

function parseTags(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadTeamRecipeVocabulary({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Promise<RecipeVocabulary> {
  await assertAssistantTeamPermission({
    db,
    context,
    permission: ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
  });
  const result = await db.prepare(
    `SELECT emoji, mealType, tags
       FROM recipes
      WHERE teamId = ?
      ORDER BY updatedAt DESC`,
  ).bind(context.teamId).all<RecipeVocabularyRow>();
  const emojiCounts = new Map<string, CountedVariants>();
  const mealTypeCounts = new Map<string, CountedVariants>();
  const tagCounts = new Map<string, CountedVariants>();

  for (const recipe of result.results) {
    addValue({ counts: emojiCounts, value: recipe.emoji, maxLength: 10 });
    addValue({ counts: mealTypeCounts, value: recipe.mealType, maxLength: 50 });
    const recipeTagKeys = new Set<string>();
    for (const tag of parseTags(recipe.tags)) {
      if (typeof tag !== "string") continue;
      const key = tag.trim().toLocaleLowerCase("en-US");
      if (!key || recipeTagKeys.has(key)) continue;
      recipeTagKeys.add(key);
      addValue({ counts: tagCounts, value: tag, maxLength: 100 });
    }
  }

  return {
    emojis: rankedValues({ counts: emojiCounts, limit: VOCABULARY_LIMITS.emojis }),
    mealTypes: rankedValues({ counts: mealTypeCounts, limit: VOCABULARY_LIMITS.mealTypes }),
    tags: rankedValues({ counts: tagCounts, limit: VOCABULARY_LIMITS.tags }),
  };
}
