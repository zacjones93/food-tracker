export const MAX_FOOD_PLANNING_RESULTS = 50;

export interface FoodPlanningQuery {
  bindings: unknown[];
  sql: string;
}

export interface FoodPlanningQueryPort {
  all(query: FoodPlanningQuery): Promise<Record<string, unknown>[]>;
  first(query: FoodPlanningQuery): Promise<Record<string, unknown> | null>;
}

export interface FoodPlanningSearchResult {
  count: number;
  items: Record<string, unknown>[];
}

interface SearchInput {
  ids?: string[];
  limit: number;
  text?: string;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeFoodPlanningRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (["tags", "ingredients", "template"].includes(key)) {
        return [key, parseJson(value)];
      }
      if (["checked", "made", "isDefault", "autoAddIngredientsToGrocery"].includes(key)) {
        return [key, value === 1 || value === true];
      }
      if (
        [
          "createdAt",
          "updatedAt",
          "lastMadeDate",
          "scheduledDate",
          "startDate",
          "endDate",
        ].includes(key) && typeof value === "number"
      ) {
        return [key, new Date(value * 1_000).toISOString()];
      }
      return [key, value];
    }),
  );
}

function placeholders(length: number): string {
  return Array.from({ length }, () => "?").join(", ");
}

async function search({
  bindings,
  query,
  sql,
}: {
  bindings: unknown[];
  query: FoodPlanningQueryPort;
  sql: string;
}): Promise<FoodPlanningSearchResult> {
  const items = (await query.all({ sql, bindings })).map(normalizeFoodPlanningRecord);
  return { items, count: items.length };
}

export function createD1FoodPlanningQueryPort(db: D1Database): FoodPlanningQueryPort {
  return {
    async all({ sql, bindings }) {
      const result = await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>();
      return result.results;
    },
    async first({ sql, bindings }) {
      return db.prepare(sql).bind(...bindings).first<Record<string, unknown>>();
    },
  };
}

export function createFoodPlanningRetrieval({
  query,
  teamId,
}: {
  query: FoodPlanningQueryPort;
  teamId: string;
}) {
  return {
    recipeFacets: {
      async get() {
        const rows = await query.all({
          sql: `SELECT mealType, difficulty, tags
                  FROM recipes
                 WHERE teamId = ?`,
          bindings: [teamId],
        });
        const mealTypes = new Set<string>();
        const difficulties = new Set<string>();
        const tags = new Set<string>();
        for (const row of rows) {
          if (typeof row.mealType === "string") mealTypes.add(row.mealType);
          if (typeof row.difficulty === "string") difficulties.add(row.difficulty);
          const parsedTags = parseJson(row.tags);
          if (Array.isArray(parsedTags)) {
            for (const tag of parsedTags) if (typeof tag === "string") tags.add(tag);
          }
        }
        return {
          mealTypes: [...mealTypes].sort(),
          difficulties: [...difficulties].sort(),
          tags: [...tags].sort(),
        };
      },
    },
    recipeBooks: {
      async search({ text, ids, limit }: SearchInput) {
        const conditions = ["(teamId = ? OR teamId IS NULL)"];
        const bindings: unknown[] = [teamId];
        if (text) {
          conditions.push("lower(name) LIKE ?");
          bindings.push(`%${text.toLowerCase()}%`);
        }
        if (ids?.length) {
          conditions.push(`id IN (${placeholders(ids.length)})`);
          bindings.push(...ids);
        }
        bindings.push(limit);
        return search({
          query,
          sql: `SELECT id, name, teamId,
                       CASE WHEN teamId = ? THEN 'team' ELSE 'global' END AS ownershipScope,
                       createdAt, updatedAt
                  FROM recipe_books
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY lower(name), id
                 LIMIT ?`,
          bindings: [teamId, ...bindings],
        });
      },
    },
    groceryTemplates: {
      async search({
        text,
        ids,
        includeItems,
        limit,
      }: SearchInput & { includeItems: boolean }) {
        const conditions = ["(teamId = ? OR (teamId IS NULL AND isDefault = 1))"];
        const bindings: unknown[] = [teamId];
        if (text) {
          conditions.push("lower(name) LIKE ?");
          bindings.push(`%${text.toLowerCase()}%`);
        }
        if (ids?.length) {
          conditions.push(`id IN (${placeholders(ids.length)})`);
          bindings.push(...ids);
        }
        bindings.push(limit);
        return search({
          query,
          sql: `SELECT id, name, teamId, isDefault,
                       ${includeItems ? "template" : "NULL AS template"},
                       createdAt, updatedAt
                  FROM grocery_list_templates
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY isDefault DESC, lower(name), id
                 LIMIT ?`,
          bindings,
        });
      },
    },
    groceryItems: {
      async search({
        weekIds,
        text,
        checked,
        categories,
        limit,
      }: {
        categories?: string[];
        checked?: boolean;
        limit: number;
        text?: string;
        weekIds: string[];
      }) {
        const conditions = [`gi.weekId IN (${placeholders(weekIds.length)})`];
        const bindings: unknown[] = [teamId, ...weekIds];
        if (text) {
          conditions.push("lower(gi.name) LIKE ?");
          bindings.push(`%${text.toLowerCase()}%`);
        }
        if (checked !== undefined) {
          conditions.push("gi.checked = ?");
          bindings.push(checked ? 1 : 0);
        }
        if (categories?.length) {
          conditions.push(`gi.category IN (${placeholders(categories.length)})`);
          bindings.push(...categories);
        }
        bindings.push(limit);
        return search({
          query,
          sql: `SELECT gi.id, gi.weekId, gi.name, gi.checked, gi."order", gi.category,
                       gi.createdAt, gi.updatedAt
                  FROM grocery_items gi
                  JOIN weeks w ON w.id = gi.weekId AND w.teamId = ?
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY gi.weekId, gi."order", gi.id
                 LIMIT ?`,
          bindings,
        });
      },
    },
    weekRecipes: {
      async search({
        weekIds,
        recipeIds,
        made,
        limit,
      }: {
        limit: number;
        made?: boolean;
        recipeIds?: string[];
        weekIds?: string[];
      }) {
        const conditions = ["w.teamId = ?"];
        const bindings: unknown[] = [teamId];
        if (weekIds?.length) {
          conditions.push(`wr.weekId IN (${placeholders(weekIds.length)})`);
          bindings.push(...weekIds);
        }
        if (recipeIds?.length) {
          conditions.push(`wr.recipeId IN (${placeholders(recipeIds.length)})`);
          bindings.push(...recipeIds);
        }
        if (made !== undefined) {
          conditions.push("wr.made = ?");
          bindings.push(made ? 1 : 0);
        }
        bindings.push(limit);
        return search({
          query,
          sql: `SELECT wr.id, wr.weekId, wr.recipeId, r.name AS recipeName,
                       wr.scheduledForWeekRecipeId, wr.sourceRecipeRelationId,
                       wr.scheduledDate, wr."order", wr.made, wr.createdAt, wr.updatedAt
                  FROM week_recipes wr
                  JOIN weeks w ON w.id = wr.weekId
                  JOIN recipes r ON r.id = wr.recipeId
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY wr.weekId, wr."order", wr.id
                 LIMIT ?`,
          bindings,
        });
      },
    },
    recipeRelations: {
      async search({ recipeIds, limit }: { recipeIds: string[]; limit: number }) {
        const ids = placeholders(recipeIds.length);
        return search({
          query,
          sql: `SELECT rr.id, rr.mainRecipeId, main.name AS mainRecipeName,
                       rr.sideRecipeId, side.name AS sideRecipeName,
                       rr.relationType, rr."order", rr.scheduleLeadDays,
                       rr.createdAt, rr.updatedAt
                  FROM recipe_relations rr
                  JOIN recipes main ON main.id = rr.mainRecipeId AND main.teamId = ?
                  JOIN recipes side ON side.id = rr.sideRecipeId AND side.teamId = ?
                 WHERE (rr.mainRecipeId IN (${ids}) OR rr.sideRecipeId IN (${ids}))
                 ORDER BY rr.mainRecipeId, rr."order", rr.id
                 LIMIT ?`,
          bindings: [teamId, teamId, ...recipeIds, ...recipeIds, limit],
        });
      },
    },
    settings: {
      async get() {
        const settings = await query.first({
          sql: `SELECT recipeVisibilityMode, defaultRecipeVisibility,
                       autoAddIngredientsToGrocery
                  FROM team_settings
                 WHERE teamId = ?
                 LIMIT 1`,
          bindings: [teamId],
        });
        return {
          recipeVisibilityMode:
            typeof settings?.recipeVisibilityMode === "string"
              ? settings.recipeVisibilityMode
              : "all",
          defaultRecipeVisibility:
            typeof settings?.defaultRecipeVisibility === "string"
              ? settings.defaultRecipeVisibility
              : "public",
          autoAddIngredientsToGrocery:
            settings?.autoAddIngredientsToGrocery === undefined
              ? true
              : settings.autoAddIngredientsToGrocery !== 0,
        };
      },
    },
  };
}

export default {
  MAX_FOOD_PLANNING_RESULTS,
  createD1FoodPlanningQueryPort,
  createFoodPlanningRetrieval,
};
