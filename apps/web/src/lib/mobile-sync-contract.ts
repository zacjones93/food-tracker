import { z } from "zod";
import {
  recipeNameSchema,
  recipeRelationTypeSchema,
  scheduleLeadDaysSchema,
} from "@/lib/food-planning/mutation";

export const mobileEntityTypeSchema = z.enum([
  "recipeBook",
  "groceryTemplate",
  "recipe",
  "week",
  "recipeRelation",
  "weekRecipe",
  "groceryItem",
]);

export type MobileEntityType = z.infer<typeof mobileEntityTypeSchema>;

const dateValueSchema = z
  .union([z.string(), z.number(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), "Invalid date");

const optionalNullableDate = dateValueSchema.nullable().optional();
const optionalNullableString = z.string().trim().max(1000).nullable().optional();

export const recipePayloadSchema = z.object({
  name: recipeNameSchema,
  sourceRecipeId: z.string().nullable().optional(),
  emoji: z.string().max(10).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).nullable().optional(),
  mealType: z.string().trim().max(50).nullable().optional(),
  difficulty: z.string().trim().max(20).nullable().optional(),
  visibility: z.enum(["public", "private", "unlisted"]).optional(),
  recipeType: z.enum(["standard", "coffee_drink"]).optional(),
  recipeLink: optionalNullableString,
  recipeBookId: z.string().nullable().optional(),
  page: z.string().max(50).nullable().optional(),
  lastMadeDate: optionalNullableDate,
  mealsEatenCount: z.number().int().min(0).optional(),
  ingredients: z
    .array(z.object({ title: z.string().optional(), items: z.array(z.string()) }))
    .nullable()
    .optional(),
  recipeBody: z.string().nullable().optional(),
});

export const weekPayloadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  emoji: z.string().max(10).nullable().optional(),
  status: z.enum(["current", "upcoming", "archived"]).optional(),
  startDate: optionalNullableDate,
  endDate: optionalNullableDate,
  weekNumber: z.number().int().nullable().optional(),
});

export const weekRecipePayloadSchema = z.object({
  weekId: z.string(),
  recipeId: z.string(),
  scheduledForWeekRecipeId: z.string().nullable().optional(),
  sourceRecipeRelationId: z.string().nullable().optional(),
  scheduledDate: optionalNullableDate,
  order: z.number().int().min(0).optional(),
  made: z.boolean().optional(),
});

export const groceryItemPayloadSchema = z.object({
  weekId: z.string(),
  name: z.string().trim().min(1).max(500),
  checked: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  category: z.string().trim().max(100).nullable().optional(),
});

export const recipeBookPayloadSchema = z.object({
  name: z.string().trim().min(1).max(500),
});

export const groceryTemplatePayloadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  template: z.array(
    z.object({
      category: z.string().max(100),
      order: z.number().int().min(0),
      items: z.array(
        z.object({
          name: z.string().max(500),
          order: z.number().int().min(0),
        }),
      ),
    }),
  ),
  isDefault: z.boolean().optional(),
});

export const recipeRelationPayloadSchema = z.object({
  mainRecipeId: z.string(),
  sideRecipeId: z.string(),
  relationType: recipeRelationTypeSchema.optional(),
  order: z.number().int().min(0).optional(),
  scheduleLeadDays: scheduleLeadDaysSchema,
});

const rawMutationSchema = z.object({
  mutationId: z.string().min(1).max(255).optional(),
  id: z.string().min(1).max(255).optional(),
  entityType: mobileEntityTypeSchema.optional(),
  entity: mobileEntityTypeSchema.optional(),
  operation: z.enum(["create", "update", "delete"]),
  clientEntityId: z.string().min(1).max(255).optional(),
  serverEntityId: z.string().min(1).max(255).optional(),
  entityId: z.string().min(1).max(255).optional(),
  baseVersion: z.number().int().min(0).optional(),
  baseUpdatedAt: optionalNullableDate,
  clientUpdatedAt: optionalNullableDate,
  changedFields: z.array(z.string().min(1).max(100)).max(100).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const mobileMutationSchema = rawMutationSchema
  .transform((mutation) => ({
    mutationId: mutation.mutationId ?? mutation.id ?? "",
    entityType: mutation.entityType ?? mutation.entity,
    operation: mutation.operation,
    clientEntityId:
      mutation.clientEntityId ?? (mutation.operation === "create" ? mutation.entityId : undefined),
    serverEntityId:
      mutation.serverEntityId ?? (mutation.operation !== "create" ? mutation.entityId : undefined),
    baseVersion: mutation.baseVersion ?? 0,
    baseUpdatedAt: mutation.baseUpdatedAt ?? mutation.clientUpdatedAt,
    changedFields:
      mutation.changedFields ??
      (mutation.operation === "delete" ? ["*"] : Object.keys(mutation.payload)),
    payload: mutation.payload,
  }))
  .refine((mutation) => mutation.mutationId.length > 0, "mutationId or id is required")
  .refine((mutation) => Boolean(mutation.entityType), "entityType or entity is required")
  .refine(
    (mutation) => mutation.operation !== "create" || Boolean(mutation.clientEntityId),
    "clientEntityId or entityId is required for create",
  )
  .refine(
    (mutation) => mutation.operation === "create" || Boolean(mutation.serverEntityId),
    "serverEntityId or entityId is required for update and delete",
  );

export const mobileSyncRequestSchema = z.object({
  cursor: z.string().optional(),
  mutations: z.array(mobileMutationSchema).max(500),
});

export const mobileChangesQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type MobileMutation = z.infer<typeof mobileMutationSchema>;
