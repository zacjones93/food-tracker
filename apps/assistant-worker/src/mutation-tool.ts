import { toolDefinition, type Tool } from "@tanstack/ai";
import { z } from "zod";

import foodPlanningMutationModule, {
  type FoodPlanningEntity,
  type FoodPlanningMutationChange,
  type FoodPlanningOperation,
} from "../../web/src/lib/food-planning/mutation";
import {
  assertAssistantTeamPermission,
  type AssistantTeamPermission,
} from "./authorization";
import type { AssistantRequestContext } from "./context";

const {
  FOOD_PLANNING_ENTITIES,
  FOOD_PLANNING_MUTABLE_FIELDS,
  FOOD_PLANNING_MUTATION_PERMISSIONS,
  FOOD_PLANNING_OPERATIONS,
  getFoodPlanningReferences,
  parseFoodPlanningMutationData,
  RECIPE_NAME_MIN_LENGTH,
  RECIPE_RELATION_TYPES,
} = foodPlanningMutationModule;

const entitySchema = z.enum(FOOD_PLANNING_ENTITIES);
const operationSchema = z.enum(FOOD_PLANNING_OPERATIONS);
const identifierSchema = z.string().trim().min(1).max(255);
const nullableStringSchema = z.string().trim().max(1_000).nullable().optional();
const optionalIsoDateSchema = z.string().datetime().nullable().optional();

const recipeDataSchema = z.object({
  name: z.string().trim().min(RECIPE_NAME_MIN_LENGTH).max(500).optional(),
  sourceRecipeId: identifierSchema.nullable().optional(),
  emoji: z.string().max(10).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).nullable().optional(),
  mealType: z.string().trim().max(50).nullable().optional(),
  difficulty: z.string().trim().max(20).nullable().optional(),
  visibility: z.enum(["public", "private", "unlisted"]).optional(),
  recipeLink: nullableStringSchema,
  recipeBookId: identifierSchema.nullable().optional(),
  page: z.string().max(50).nullable().optional(),
  lastMadeDate: optionalIsoDateSchema,
  mealsEatenCount: z.number().int().min(0).optional(),
  ingredients: z.array(z.object({
    title: z.string().max(500).optional(),
    items: z.array(z.string().max(1_000)).max(500),
  })).max(100).nullable().optional(),
  recipeBody: z.string().max(100_000).nullable().optional(),
});
const weekDataSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  emoji: z.string().max(10).nullable().optional(),
  status: z.enum(["current", "upcoming", "archived"]).optional(),
  startDate: optionalIsoDateSchema,
  endDate: optionalIsoDateSchema,
  weekNumber: z.number().int().nullable().optional(),
});
const weekRecipeDataSchema = z.object({
  weekId: identifierSchema.optional(),
  recipeId: identifierSchema.optional(),
  scheduledForWeekRecipeId: identifierSchema.nullable().optional(),
  sourceRecipeRelationId: identifierSchema.nullable().optional(),
  scheduledDate: optionalIsoDateSchema,
  order: z.number().int().min(0).optional(),
  made: z.boolean().optional(),
});
const groceryItemDataSchema = z.object({
  weekId: identifierSchema.optional(),
  name: z.string().trim().min(1).max(500).optional(),
  checked: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  category: z.string().trim().max(100).nullable().optional(),
});
const recipeBookDataSchema = z.object({ name: z.string().trim().min(1).max(500).optional() });
const groceryTemplateDataSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  template: z.array(z.object({
    category: z.string().max(100),
    order: z.number().int().min(0),
    items: z.array(z.object({
      name: z.string().max(500),
      order: z.number().int().min(0),
    })).max(500),
  })).max(100).optional(),
});
const recipeRelationDataSchema = z.object({
  mainRecipeId: identifierSchema.optional(),
  sideRecipeId: identifierSchema.optional(),
  relationType: z.enum(RECIPE_RELATION_TYPES).optional(),
  order: z.number().int().min(0).optional(),
  scheduleLeadDays: z.number().int().min(0).max(365).nullable().optional(),
});
const teamSettingsDataSchema = z.object({
  recipeVisibilityMode: z.enum(["all", "team_only"]).optional(),
  defaultRecipeVisibility: z.enum(["public", "private", "unlisted"]).optional(),
  autoAddIngredientsToGrocery: z.boolean().optional(),
});
const mutationDataSchema = z.object({
  ...recipeDataSchema.shape,
  ...weekDataSchema.shape,
  ...weekRecipeDataSchema.shape,
  ...groceryItemDataSchema.shape,
  ...recipeBookDataSchema.shape,
  ...groceryTemplateDataSchema.shape,
  ...recipeRelationDataSchema.shape,
  ...teamSettingsDataSchema.shape,
});
const mutationChangeSchema = z.object({
  entity: entitySchema,
  operation: operationSchema,
  id: identifierSchema.optional(),
  data: mutationDataSchema.default({}),
}).superRefine((change, refinement) => {
  if (change.entity === "teamSettings" && change.operation !== "update") {
    refinement.addIssue({ code: "custom", message: "teamSettings supports update only" });
  }
  if (change.entity !== "teamSettings" && change.operation !== "create" && !change.id) {
    refinement.addIssue({ code: "custom", message: "id is required for update and delete" });
  }
});

export const approvedMutationInputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  changes: z.array(mutationChangeSchema).min(1).max(25),
});

const approvedMutationOutputSchema = z.object({
  success: z.literal(true),
  applied: z.array(z.object({
    entity: entitySchema,
    operation: operationSchema,
    id: z.string(),
  })),
});

type Entity = FoodPlanningEntity;
type Operation = FoodPlanningOperation;
type MutationChange = FoodPlanningMutationChange;

const TABLES: Record<Entity, string> = {
  recipe: "recipes",
  recipeBook: "recipe_books",
  recipeRelation: "recipe_relations",
  week: "weeks",
  weekRecipe: "week_recipes",
  groceryItem: "grocery_items",
  groceryTemplate: "grocery_list_templates",
  teamSettings: "team_settings",
};

function parseData(change: MutationChange): Record<string, unknown> {
  return parseFoodPlanningMutationData(change);
}

function prefixedId(entity: Entity): string {
  const prefixes: Record<Exclude<Entity, "teamSettings">, string> = {
    recipe: "rcp",
    recipeBook: "rb",
    recipeRelation: "rr",
    week: "wk",
    weekRecipe: "wr",
    groceryItem: "gi",
    groceryTemplate: "glt",
  };
  if (entity === "teamSettings") return "team-settings";
  return `${prefixes[entity]}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function timestamp(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Expected an ISO date string");
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error("Invalid date");
  return Math.floor(parsed / 1_000);
}

function databaseValue(key: string, value: unknown): unknown {
  if (["tags", "ingredients", "template"].includes(key)) {
    return value === null ? null : JSON.stringify(value);
  }
  if (["made", "checked", "autoAddIngredientsToGrocery"].includes(key)) {
    return value ? 1 : 0;
  }
  if (["startDate", "endDate", "scheduledDate", "lastMadeDate"].includes(key)) {
    return timestamp(value);
  }
  return value;
}

async function ownedEntityExists({
  db,
  entity,
  entityId,
  teamId,
}: {
  db: D1Database;
  entity: Exclude<Entity, "teamSettings">;
  entityId: string;
  teamId: string;
}): Promise<boolean> {
  const queries: Record<Exclude<Entity, "teamSettings">, string> = {
    recipe: "SELECT r.id FROM recipes r WHERE r.id = ? AND r.teamId = ? LIMIT 1",
    recipeBook: "SELECT rb.id FROM recipe_books rb WHERE rb.id = ? AND rb.teamId = ? LIMIT 1",
    recipeRelation: `SELECT rr.id FROM recipe_relations rr
      JOIN recipes main ON main.id = rr.mainRecipeId AND main.teamId = ?
      JOIN recipes side ON side.id = rr.sideRecipeId AND side.teamId = ?
      WHERE rr.id = ? LIMIT 1`,
    week: "SELECT w.id FROM weeks w WHERE w.id = ? AND w.teamId = ? LIMIT 1",
    weekRecipe: `SELECT wr.id FROM week_recipes wr
      JOIN weeks w ON w.id = wr.weekId AND w.teamId = ?
      WHERE wr.id = ? LIMIT 1`,
    groceryItem: `SELECT gi.id FROM grocery_items gi
      JOIN weeks w ON w.id = gi.weekId AND w.teamId = ?
      WHERE gi.id = ? LIMIT 1`,
    groceryTemplate: `SELECT glt.id FROM grocery_list_templates glt
      WHERE glt.id = ? AND glt.teamId = ? AND glt.isDefault = 0 LIMIT 1`,
  };
  const teamFirst = ["recipeRelation", "weekRecipe", "groceryItem"].includes(entity);
  const bindings = entity === "recipeRelation"
    ? [teamId, teamId, entityId]
    : teamFirst
      ? [teamId, entityId]
      : [entityId, teamId];
  return Boolean(await db.prepare(queries[entity]).bind(...bindings).first<{ id: string }>());
}

async function assertOwnedReference({
  db,
  entity,
  entityId,
  teamId,
}: {
  db: D1Database;
  entity: Exclude<Entity, "teamSettings">;
  entityId: string;
  teamId: string;
}): Promise<void> {
  if (!await ownedEntityExists({ db, entity, entityId, teamId })) {
    throw new Error(`${entity} was not found in the active team`);
  }
}

async function assertReadableReference({
  db,
  entity,
  entityId,
  teamId,
}: {
  db: D1Database;
  entity: "recipe" | "recipeBook";
  entityId: string;
  teamId: string;
}): Promise<void> {
  const sql = entity === "recipeBook"
    ? "SELECT id FROM recipe_books WHERE id = ? AND (teamId = ? OR teamId IS NULL) LIMIT 1"
    : `SELECT id FROM recipes
        WHERE id = ? AND (teamId = ? OR visibility IN ('public', 'unlisted')) LIMIT 1`;
  const readable = await db.prepare(sql).bind(entityId, teamId).first<{ id: string }>();
  if (!readable) throw new Error(`${entity} was not readable by the active team`);
}

async function assertReferencesOwned({
  db,
  entity,
  data,
  teamId,
}: {
  db: D1Database;
  entity: Entity;
  data: Record<string, unknown>;
  teamId: string;
}): Promise<void> {
  for (const reference of getFoodPlanningReferences({ entity, data })) {
    if (reference.access === "readable") {
      if (reference.entity !== "recipe" && reference.entity !== "recipeBook") {
        throw new Error(`Unsupported readable reference ${reference.entity}`);
      }
      await assertReadableReference({
        db,
        entity: reference.entity,
        entityId: reference.id,
        teamId,
      });
      continue;
    }
    await assertOwnedReference({
      db,
      entity: reference.entity,
      entityId: reference.id,
      teamId,
    });
  }
}

async function preflightChange({
  db,
  context,
  change,
  data,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  change: MutationChange;
  data: Record<string, unknown>;
}): Promise<void> {
  await assertAssistantTeamPermission({
    db,
    context,
    permission: FOOD_PLANNING_MUTATION_PERMISSIONS[change.entity][
      change.operation
    ] as AssistantTeamPermission,
  });
  if (change.entity === "teamSettings") {
    const settings = await db.prepare(
      "SELECT teamId FROM team_settings WHERE teamId = ? LIMIT 1",
    ).bind(context.teamId).first<{ teamId: string }>();
    if (!settings) throw new Error("teamSettings was not found in the active team");
  }
  if (change.entity !== "teamSettings" && change.operation !== "create") {
    if (!change.id || !await ownedEntityExists({
      db,
      entity: change.entity,
      entityId: change.id,
      teamId: context.teamId,
    })) {
      throw new Error(`${change.entity} was not found in the active team`);
    }
  }
  await assertReferencesOwned({ db, entity: change.entity, data, teamId: context.teamId });
}

function prepareCreateEntity({
  db,
  context,
  entity,
  data,
  defaultRecipeVisibility,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  entity: Exclude<Entity, "teamSettings">;
  data: Record<string, unknown>;
  defaultRecipeVisibility: string;
}): { id: string; statement: D1PreparedStatement } {
  const id = prefixedId(entity);
  const now = Math.floor(Date.now() / 1_000);
  let statement: D1PreparedStatement;
  switch (entity) {
    case "recipe":
      statement = db.prepare(
        `INSERT INTO recipes
         (id, teamId, name, sourceRecipeId, emoji, tags, mealType, difficulty, visibility,
          recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount,
          ingredients, recipeBody, createdAt, updatedAt, updateCounter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(
        id,
        context.teamId,
        data.name,
        data.sourceRecipeId ?? null,
        data.emoji ?? null,
        databaseValue("tags", data.tags ?? []),
        data.mealType ?? null,
        data.difficulty ?? null,
        data.visibility ?? defaultRecipeVisibility,
        data.recipeLink ?? null,
        data.recipeBookId ?? null,
        data.page ?? null,
        databaseValue("lastMadeDate", data.lastMadeDate ?? null),
        data.mealsEatenCount ?? 0,
        databaseValue("ingredients", data.ingredients ?? []),
        data.recipeBody ?? null,
        now,
        now,
      );
      break;
    case "recipeBook":
      statement = db.prepare(
        `INSERT INTO recipe_books (id, teamId, name, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(id, context.teamId, data.name, now, now);
      break;
    case "recipeRelation":
      statement = db.prepare(
        `INSERT INTO recipe_relations
         (id, mainRecipeId, sideRecipeId, relationType, "order", scheduleLeadDays,
          createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        data.mainRecipeId,
        data.sideRecipeId,
        data.relationType ?? "side",
        data.order ?? 0,
        data.scheduleLeadDays ?? null,
        now,
        now,
      );
      break;
    case "week":
      statement = db.prepare(
        `INSERT INTO weeks
         (id, teamId, name, emoji, status, startDate, endDate, weekNumber,
          createdAt, updatedAt, updateCounter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(
        id,
        context.teamId,
        data.name,
        data.emoji ?? null,
        data.status ?? "upcoming",
        databaseValue("startDate", data.startDate ?? null),
        databaseValue("endDate", data.endDate ?? null),
        data.weekNumber ?? null,
        now,
        now,
      );
      break;
    case "weekRecipe":
      statement = db.prepare(
        `INSERT INTO week_recipes
         (id, weekId, recipeId, scheduledForWeekRecipeId, sourceRecipeRelationId,
          scheduledDate, "order", made, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        data.weekId,
        data.recipeId,
        data.scheduledForWeekRecipeId ?? null,
        data.sourceRecipeRelationId ?? null,
        databaseValue("scheduledDate", data.scheduledDate ?? null),
        data.order ?? 0,
        databaseValue("made", data.made ?? false),
        now,
        now,
      );
      break;
    case "groceryItem":
      statement = db.prepare(
        `INSERT INTO grocery_items
         (id, weekId, name, checked, "order", category, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        data.weekId,
        data.name,
        databaseValue("checked", data.checked ?? false),
        data.order ?? 0,
        data.category ?? null,
        now,
        now,
      );
      break;
    case "groceryTemplate":
      statement = db.prepare(
        `INSERT INTO grocery_list_templates
         (id, name, template, teamId, isDefault, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ).bind(
        id,
        data.name,
        databaseValue("template", data.template),
        context.teamId,
        now,
        now,
      );
      break;
  }
  return { id, statement };
}

function ownershipClause(entity: Entity): string {
  switch (entity) {
    case "recipe":
    case "recipeBook":
    case "week":
      return "id = ? AND teamId = ?";
    case "groceryTemplate":
      return "id = ? AND teamId = ? AND isDefault = 0";
    case "weekRecipe":
      return "id = ? AND weekId IN (SELECT id FROM weeks WHERE teamId = ?)";
    case "groceryItem":
      return "id = ? AND weekId IN (SELECT id FROM weeks WHERE teamId = ?)";
    case "recipeRelation":
      return `id = ?
        AND mainRecipeId IN (SELECT id FROM recipes WHERE teamId = ?)
        AND sideRecipeId IN (SELECT id FROM recipes WHERE teamId = ?)`;
    case "teamSettings":
      return "teamId = ?";
  }
}

function prepareUpdateEntity({
  db,
  context,
  entity,
  entityId,
  data,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  entity: Entity;
  entityId?: string;
  data: Record<string, unknown>;
}): { id: string; statement: D1PreparedStatement } {
  const entries = Object.entries(data).filter(([key, value]) =>
    value !== undefined && FOOD_PLANNING_MUTABLE_FIELDS[entity].has(key),
  );
  const setters = entries.map(([key]) => `"${key}" = ?`);
  const bindings = entries.map(([key, value]) => databaseValue(key, value));
  const now = Math.floor(Date.now() / 1_000);
  setters.push("updatedAt = ?");
  bindings.push(now);
  if (["recipe", "week"].includes(entity)) setters.push("updateCounter = updateCounter + 1");
  const ownership = ownershipClause(entity);
  if (entity === "teamSettings") {
    bindings.push(context.teamId);
  } else if (entity === "recipeRelation") {
    bindings.push(entityId, context.teamId, context.teamId);
  } else {
    bindings.push(entityId, context.teamId);
  }
  const statement = db.prepare(
    `UPDATE ${TABLES[entity]} SET ${setters.join(", ")} WHERE ${ownership}`,
  ).bind(...bindings);
  return {
    id: entity === "teamSettings" ? context.teamId : entityId!,
    statement,
  };
}

function prepareDeleteEntity({
  db,
  context,
  entity,
  entityId,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  entity: Exclude<Entity, "teamSettings">;
  entityId: string;
}): D1PreparedStatement {
  const ownership = ownershipClause(entity);
  const bindings = entity === "recipeRelation"
    ? [entityId, context.teamId, context.teamId]
    : [entityId, context.teamId];
  return db.prepare(
    `DELETE FROM ${TABLES[entity]} WHERE ${ownership}`,
  ).bind(...bindings);
}

interface EntitlementRow {
  currentPeriodEnd: number | null;
  features: string | null;
  gracePeriodExpiresAt: number | null;
  status: string;
}

function weekCreationLimit(features: string | null): number | null | undefined {
  if (!features) return undefined;
  try {
    const parsed: unknown = JSON.parse(features);
    if (!parsed || typeof parsed !== "object" || !("weekCreationLimit" in parsed)) {
      return undefined;
    }
    const value = (parsed as { weekCreationLimit: unknown }).weekCreationLimit;
    return value === null || typeof value === "number" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function getAssistantWeekCreationLimit({
  db,
  teamId,
}: {
  db: D1Database;
  teamId: string;
}): Promise<number | null> {
  const [apple, stripe] = await Promise.all([
    db.prepare(
      `SELECT a.status, a.currentPeriodEnd, a.gracePeriodExpiresAt, s.features
         FROM apple_subscription_binding a
         JOIN team_entitlement_snapshot s ON s.id = a.entitlementSnapshotId
        WHERE a.teamId = ? LIMIT 1`,
    ).bind(teamId).first<EntitlementRow>(),
    db.prepare(
      `SELECT t.status, t.currentPeriodEnd, NULL AS gracePeriodExpiresAt, s.features
         FROM team_subscription t
         JOIN team_entitlement_snapshot s ON s.id = t.entitlementSnapshotId
        WHERE t.teamId = ? LIMIT 1`,
    ).bind(teamId).first<EntitlementRow>(),
  ]);
  const now = Math.floor(Date.now() / 1_000);
  const appleIsActive = apple?.status === "active" && (apple.currentPeriodEnd ?? 0) > now;
  const appleIsInGrace = apple?.status === "grace_period" &&
    (apple.gracePeriodExpiresAt ?? 0) > now;
  if (apple && (appleIsActive || appleIsInGrace)) {
    const limit = weekCreationLimit(apple.features);
    if (limit !== undefined) return limit;
  }
  if (stripe && ["active", "trialing"].includes(stripe.status)) {
    const limit = weekCreationLimit(stripe.features);
    if (limit !== undefined) return limit;
  }
  return 4;
}

async function reserveAssistantWeekCreations({
  count,
  db,
  teamId,
}: {
  count: number;
  db: D1Database;
  teamId: string;
}): Promise<void> {
  if (count === 0) return;
  const limit = await getAssistantWeekCreationLimit({ db, teamId });
  const now = Math.floor(Date.now() / 1_000);
  await db.prepare(
    `INSERT INTO team_feature_usage
       (id, teamId, feature, usageCount, createdAt, updatedAt)
     SELECT ?, ?, 'week_creations', 0, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM team_feature_usage
         WHERE teamId = ? AND feature = 'week_creations'
      )`,
  ).bind(
    `tfu_${crypto.randomUUID().replaceAll("-", "")}`,
    teamId,
    now,
    now,
    teamId,
  ).run();
  const sql = limit === null
    ? `UPDATE team_feature_usage SET usageCount = usageCount + ?, updatedAt = ?
        WHERE teamId = ? AND feature = 'week_creations'`
    : `UPDATE team_feature_usage SET usageCount = usageCount + ?, updatedAt = ?
        WHERE teamId = ? AND feature = 'week_creations' AND usageCount + ? <= ?`;
  const bindings = limit === null
    ? [count, now, teamId]
    : [count, now, teamId, count, limit];
  const reserved = await db.prepare(sql).bind(...bindings).run();
  if ((reserved.meta.changes ?? 0) !== 1) {
    throw new Error(
      `Your team has used its ${limit} included week creations. Subscribe to create another week.`,
    );
  }
}

async function releaseAssistantWeekCreations({
  count,
  db,
  teamId,
}: {
  count: number;
  db: D1Database;
  teamId: string;
}): Promise<void> {
  if (count === 0) return;
  await db.prepare(
    `UPDATE team_feature_usage
        SET usageCount = MAX(0, usageCount - ?), updatedAt = ?
      WHERE teamId = ? AND feature = 'week_creations'`,
  ).bind(count, Math.floor(Date.now() / 1_000), teamId).run();
}

export async function applyApprovedTeamChanges({
  db,
  context,
  changes,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  changes: MutationChange[];
}): Promise<z.infer<typeof approvedMutationOutputSchema>> {
  const prepared = changes.map((change) => ({ change, data: parseData(change) }));
  for (const item of prepared) {
    await preflightChange({ db, context, change: item.change, data: item.data });
  }

  const needsDefaultRecipeVisibility = prepared.some(({ change, data }) =>
    change.entity === "recipe" && change.operation === "create" && !data.visibility,
  );
  const settings = needsDefaultRecipeVisibility
    ? await db.prepare(
      "SELECT defaultRecipeVisibility FROM team_settings WHERE teamId = ? LIMIT 1",
    ).bind(context.teamId).first<{ defaultRecipeVisibility: string }>()
    : null;
  const defaultRecipeVisibility = settings?.defaultRecipeVisibility ?? "public";

  const applied: Array<{ entity: Entity; operation: Operation; id: string }> = [];
  const statements: D1PreparedStatement[] = [];
  for (const { change, data } of prepared) {
    if (change.operation === "create") {
      if (change.entity === "teamSettings") throw new Error("teamSettings create is not supported");
      const { id, statement } = prepareCreateEntity({
        db,
        context,
        entity: change.entity,
        data,
        defaultRecipeVisibility,
      });
      statements.push(statement);
      applied.push({ entity: change.entity, operation: change.operation, id });
      continue;
    }
    if (change.operation === "update") {
      const { id, statement } = prepareUpdateEntity({
        db,
        context,
        entity: change.entity,
        entityId: change.id,
        data,
      });
      statements.push(statement);
      applied.push({ entity: change.entity, operation: change.operation, id });
      continue;
    }
    if (change.entity === "teamSettings" || !change.id) {
      throw new Error("Invalid delete target");
    }
    statements.push(prepareDeleteEntity({
      db,
      context,
      entity: change.entity,
      entityId: change.id,
    }));
    applied.push({ entity: change.entity, operation: change.operation, id: change.id });
  }
  const weekCreations = prepared.filter(({ change }) =>
    change.entity === "week" && change.operation === "create"
  ).length;
  await reserveAssistantWeekCreations({ count: weekCreations, db, teamId: context.teamId });
  try {
    const results = await db.batch(statements);
    for (const [index, result] of results.entries()) {
      if ((result.meta.changes ?? 0) !== 1) {
        const change = applied[index];
        throw new Error(
          `${change.entity} ${change.operation} did not match exactly one active-team record`,
        );
      }
    }
  } catch (error) {
    await releaseAssistantWeekCreations({ count: weekCreations, db, teamId: context.teamId });
    throw error;
  }
  return { success: true, applied };
}

export function createApprovedMutationTool({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Tool {
  return toolDefinition({
    name: "apply_team_changes",
    description: `Apply up to 25 explicit food-planning changes after user approval.
Supported entities: recipe, recipeBook, recipeRelation, week, weekRecipe, groceryItem, groceryTemplate, and food-planning teamSettings.
Every target and foreign-key reference is rechecked against the authenticated active team immediately before execution. Account, membership, billing, AI-budget, and admin mutations are not supported.`,
    inputSchema: approvedMutationInputSchema,
    outputSchema: approvedMutationOutputSchema,
    needsApproval: true,
  }).server(async ({ changes }) => applyApprovedTeamChanges({
    db,
    context,
    changes: changes.map((change) => ({ ...change, data: change.data ?? {} })),
  }));
}
