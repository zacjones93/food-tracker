import { z } from "zod";

export const FOOD_PLANNING_ENTITIES = [
  "recipe",
  "recipeBook",
  "recipeRelation",
  "week",
  "weekRecipe",
  "groceryItem",
  "groceryTemplate",
  "teamSettings",
] as const;

export const FOOD_PLANNING_OPERATIONS = ["create", "update", "delete"] as const;

export const RECIPE_RELATION_TYPES = [
  "side",
  "base",
  "sauce",
  "topping",
  "dessert",
  "custom",
] as const;
export const RECIPE_NAME_MIN_LENGTH = 2;

export const foodPlanningEntitySchema = z.enum(FOOD_PLANNING_ENTITIES);
export const foodPlanningOperationSchema = z.enum(FOOD_PLANNING_OPERATIONS);
export const recipeRelationTypeSchema = z.enum(RECIPE_RELATION_TYPES);
export const recipeNameSchema = z.string().trim().min(
  RECIPE_NAME_MIN_LENGTH,
  "Recipe name must contain at least 2 characters",
).max(500);
export const scheduleLeadDaysSchema = z.number().int().min(0).max(365).nullable().optional();

export type FoodPlanningEntity = z.infer<typeof foodPlanningEntitySchema>;
export type FoodPlanningOperation = z.infer<typeof foodPlanningOperationSchema>;

const identifierSchema = z.string().trim().min(1).max(255);
const nullableStringSchema = z.string().trim().max(1_000).nullable().optional();
const optionalIsoDateSchema = z.string().datetime().nullable().optional();

export const recipeMutationDataSchema = z.object({
  name: recipeNameSchema.optional(),
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

export const weekMutationDataSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  emoji: z.string().max(10).nullable().optional(),
  status: z.enum(["current", "upcoming", "archived"]).optional(),
  startDate: optionalIsoDateSchema,
  endDate: optionalIsoDateSchema,
  weekNumber: z.number().int().nullable().optional(),
});

export const weekRecipeMutationDataSchema = z.object({
  weekId: identifierSchema.optional(),
  recipeId: identifierSchema.optional(),
  scheduledForWeekRecipeId: identifierSchema.nullable().optional(),
  sourceRecipeRelationId: identifierSchema.nullable().optional(),
  scheduledDate: optionalIsoDateSchema,
  order: z.number().int().min(0).optional(),
  made: z.boolean().optional(),
});

export const groceryItemMutationDataSchema = z.object({
  weekId: identifierSchema.optional(),
  name: z.string().trim().min(1).max(500).optional(),
  checked: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  category: z.string().trim().max(100).nullable().optional(),
});

export const recipeBookMutationDataSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
});

export const groceryTemplateMutationDataSchema = z.object({
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

export const recipeRelationMutationDataSchema = z.object({
  mainRecipeId: identifierSchema.optional(),
  sideRecipeId: identifierSchema.optional(),
  relationType: recipeRelationTypeSchema.optional(),
  order: z.number().int().min(0).optional(),
  scheduleLeadDays: scheduleLeadDaysSchema,
});

export const teamSettingsMutationDataSchema = z.object({
  recipeVisibilityMode: z.enum(["all", "team_only"]).optional(),
  defaultRecipeVisibility: z.enum(["public", "private", "unlisted"]).optional(),
  autoAddIngredientsToGrocery: z.boolean().optional(),
});

export const FOOD_PLANNING_MUTATION_DATA_SCHEMAS = {
  recipe: recipeMutationDataSchema,
  recipeBook: recipeBookMutationDataSchema,
  recipeRelation: recipeRelationMutationDataSchema,
  week: weekMutationDataSchema,
  weekRecipe: weekRecipeMutationDataSchema,
  groceryItem: groceryItemMutationDataSchema,
  groceryTemplate: groceryTemplateMutationDataSchema,
  teamSettings: teamSettingsMutationDataSchema,
} as const;

export const FOOD_PLANNING_REQUIRED_CREATE_FIELDS: Partial<
  Record<FoodPlanningEntity, readonly string[]>
> = {
  recipe: ["name"],
  recipeBook: ["name"],
  recipeRelation: ["mainRecipeId", "sideRecipeId"],
  week: ["name"],
  weekRecipe: ["weekId", "recipeId"],
  groceryItem: ["weekId", "name"],
  groceryTemplate: ["name", "template"],
};

export const FOOD_PLANNING_MUTABLE_FIELDS: Record<
  FoodPlanningEntity,
  ReadonlySet<string>
> = Object.fromEntries(
  Object.entries(FOOD_PLANNING_MUTATION_DATA_SCHEMAS).map(([entity, schema]) => [
    entity,
    new Set(Object.keys(schema.shape)),
  ]),
) as unknown as Record<FoodPlanningEntity, ReadonlySet<string>>;

export const FOOD_PLANNING_MUTATION_PERMISSIONS: Record<
  FoodPlanningEntity,
  Record<FoodPlanningOperation, string>
> = {
  recipe: { create: "create_recipes", update: "edit_recipes", delete: "delete_recipes" },
  recipeBook: { create: "create_recipes", update: "edit_recipes", delete: "delete_recipes" },
  recipeRelation: { create: "edit_recipes", update: "edit_recipes", delete: "edit_recipes" },
  week: { create: "create_schedules", update: "edit_schedules", delete: "delete_schedules" },
  weekRecipe: { create: "edit_schedules", update: "edit_schedules", delete: "edit_schedules" },
  groceryItem: { create: "edit_schedules", update: "edit_schedules", delete: "edit_schedules" },
  groceryTemplate: {
    create: "create_grocery_templates",
    update: "edit_grocery_templates",
    delete: "delete_grocery_templates",
  },
  teamSettings: {
    create: "edit_team_settings",
    update: "edit_team_settings",
    delete: "edit_team_settings",
  },
};

const combinedMutationDataSchema = z.object({
  ...recipeMutationDataSchema.shape,
  ...weekMutationDataSchema.shape,
  ...weekRecipeMutationDataSchema.shape,
  ...groceryItemMutationDataSchema.shape,
  ...recipeBookMutationDataSchema.shape,
  ...groceryTemplateMutationDataSchema.shape,
  ...recipeRelationMutationDataSchema.shape,
  ...teamSettingsMutationDataSchema.shape,
});

export const foodPlanningMutationChangeSchema = z.object({
  entity: foodPlanningEntitySchema,
  operation: foodPlanningOperationSchema,
  id: identifierSchema.optional(),
  data: combinedMutationDataSchema.default({}),
}).superRefine((change, context) => {
  if (change.entity === "teamSettings" && change.operation !== "update") {
    context.addIssue({ code: "custom", message: "teamSettings supports update only" });
  }
  if (change.entity !== "teamSettings" && change.operation !== "create" && !change.id) {
    context.addIssue({ code: "custom", message: "id is required for update and delete" });
  }
});

export type FoodPlanningMutationChange = z.infer<typeof foodPlanningMutationChangeSchema>;

export function parseFoodPlanningMutationData({
  entity,
  operation,
  data,
}: {
  entity: FoodPlanningEntity;
  operation: FoodPlanningOperation;
  data: unknown;
}): Record<string, unknown> {
  if (operation === "delete") return {};
  const parsed = FOOD_PLANNING_MUTATION_DATA_SCHEMAS[entity].parse(data) as Record<
    string,
    unknown
  >;
  const entries = Object.entries(parsed).filter(([, value]) => value !== undefined);
  if (operation === "create") {
    for (const field of FOOD_PLANNING_REQUIRED_CREATE_FIELDS[entity] ?? []) {
      if (!entries.some(([key]) => key === field)) {
        throw new Error(`${entity}.${field} is required for create`);
      }
    }
  }
  if (operation === "update" && entries.length === 0) {
    throw new Error(`${entity} update requires at least one field`);
  }
  return Object.fromEntries(entries);
}

export interface FoodPlanningReference {
  access: "owned" | "readable";
  entity: Exclude<FoodPlanningEntity, "teamSettings">;
  field: string;
  id: string;
}

export function getFoodPlanningReferences({
  entity,
  data,
}: {
  entity: FoodPlanningEntity;
  data: Record<string, unknown>;
}): FoodPlanningReference[] {
  const definitions: Partial<Record<FoodPlanningEntity, Array<{
    access: FoodPlanningReference["access"];
    entity: FoodPlanningReference["entity"];
    field: string;
  }>>> = {
    recipe: [
      { field: "recipeBookId", entity: "recipeBook", access: "readable" },
      { field: "sourceRecipeId", entity: "recipe", access: "readable" },
    ],
    weekRecipe: [
      { field: "weekId", entity: "week", access: "owned" },
      { field: "recipeId", entity: "recipe", access: "owned" },
      { field: "scheduledForWeekRecipeId", entity: "weekRecipe", access: "owned" },
      { field: "sourceRecipeRelationId", entity: "recipeRelation", access: "owned" },
    ],
    groceryItem: [{ field: "weekId", entity: "week", access: "owned" }],
    recipeRelation: [
      { field: "mainRecipeId", entity: "recipe", access: "owned" },
      { field: "sideRecipeId", entity: "recipe", access: "owned" },
    ],
  };

  return (definitions[entity] ?? []).flatMap((definition) => {
    const id = data[definition.field];
    return typeof id === "string" ? [{ ...definition, id }] : [];
  });
}

const DEPENDENCY_ORDER: readonly FoodPlanningEntity[] = [
  "recipeBook",
  "groceryTemplate",
  "recipe",
  "week",
  "recipeRelation",
  "weekRecipe",
  "groceryItem",
  "teamSettings",
];

export function orderFoodPlanningMutations<
  Change extends Pick<FoodPlanningMutationChange, "entity" | "operation">,
>(changes: readonly Change[]): Change[] {
  return changes.map((change, index) => ({ change, index })).sort((left, right) => {
    const leftPhase = left.change.operation === "delete" ? 1 : 0;
    const rightPhase = right.change.operation === "delete" ? 1 : 0;
    if (leftPhase !== rightPhase) return leftPhase - rightPhase;
    const leftOrder = DEPENDENCY_ORDER.indexOf(left.change.entity);
    const rightOrder = DEPENDENCY_ORDER.indexOf(right.change.entity);
    const direction = leftPhase === 1 ? -1 : 1;
    return direction * (leftOrder - rightOrder) || left.index - right.index;
  }).map(({ change }) => change);
}

export default {
  FOOD_PLANNING_ENTITIES,
  FOOD_PLANNING_MUTABLE_FIELDS,
  FOOD_PLANNING_MUTATION_PERMISSIONS,
  FOOD_PLANNING_OPERATIONS,
  RECIPE_NAME_MIN_LENGTH,
  RECIPE_RELATION_TYPES,
  getFoodPlanningReferences,
  parseFoodPlanningMutationData,
};
