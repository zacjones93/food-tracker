import { z } from "zod";

export const DIAL_INTEGRATION_CONTRACT = "listo-dial";
export const DIAL_INTEGRATION_VERSION = 1;

export const dialRecipeVisibilitySchema = z.enum(["public", "private", "unlisted"]);
export const dialConnectionScopeSchema = z.enum(["account", "team"]);

export const dialRecipeProjectionSchema = z.object({
  id: z.string().min(1).max(255),
  revision: z.number().int().positive(),
  type: z.literal("coffee_drink"),
  name: z.string().min(1).max(500),
  emoji: z.string().max(10).nullable(),
  tags: z.array(z.string().max(100)).max(100),
  ingredients: z.array(z.object({
    title: z.string().max(255).optional(),
    items: z.array(z.string().max(1000)).max(250),
  })).max(50),
  instructions: z.string().max(100_000).nullable(),
  visibility: dialRecipeVisibilitySchema,
  listoUrl: z.string().url().max(1000),
});

export const dialRecipeAudienceSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("global") }),
  z.object({ scope: z.literal("direct_link") }),
  z.object({ scope: z.literal("paired_team"), teamPairingId: z.string().min(1).max(255) }),
]);

export const dialRecipeEventSchema = z.object({
  contract: z.literal(DIAL_INTEGRATION_CONTRACT),
  schemaVersion: z.literal(DIAL_INTEGRATION_VERSION),
  eventId: z.string().min(1).max(500),
  eventType: z.enum(["recipe.upsert", "recipe.withdraw"]),
  occurredAt: z.string().datetime(),
  recipeId: z.string().min(1).max(255),
  revision: z.number().int().positive(),
  audience: dialRecipeAudienceSchema.optional(),
  recipe: dialRecipeProjectionSchema.optional(),
  reason: z.enum([
    "recipe_deleted",
    "recipe_type_changed",
    "team_pairing_required",
    "team_pairing_disconnected",
  ]).optional(),
}).superRefine((event, context) => {
  if (event.eventType === "recipe.upsert" && (!event.recipe || !event.audience)) {
    context.addIssue({ code: "custom", message: "Upserts require recipe and audience" });
  }
  if (event.eventType === "recipe.withdraw" && !event.reason) {
    context.addIssue({ code: "custom", message: "Withdrawals require a reason" });
  }
});

export const beginDialConnectionIntentSchema = z.object({
  requestedScopes: z.array(dialConnectionScopeSchema).min(1).max(2),
  dialUserRef: z.string().trim().min(1).max(255).optional(),
  dialUserLabel: z.string().trim().min(1).max(255).optional(),
  dialTeamRef: z.string().trim().min(1).max(255).optional(),
  dialTeamLabel: z.string().trim().min(1).max(255).optional(),
  emailHint: z.string().email().max(255).optional(),
  returnUrl: z.string().url().max(1000),
}).superRefine((input, context) => {
  if (input.requestedScopes.includes("account") && !input.dialUserRef) {
    context.addIssue({ code: "custom", message: "Account linking requires dialUserRef" });
  }
  if (input.requestedScopes.includes("team") && !input.dialTeamRef) {
    context.addIssue({ code: "custom", message: "Team pairing requires dialTeamRef" });
  }
});

export const consumeDialConnectionIntentSchema = z.object({
  intentToken: z.string().min(32).max(500),
});

export const dialBackfillRequestSchema = z.object({
  cursor: z.string().max(255).optional(),
  limit: z.number().int().min(1).max(200).default(100),
  teamPairingId: z.string().max(255).optional(),
});

export const dialEditCapabilityRequestSchema = z.object({
  accountLinkId: z.string().min(1).max(255),
  recipeId: z.string().min(1).max(255),
});

export type DialRecipeProjection = z.infer<typeof dialRecipeProjectionSchema>;
export type DialRecipeEvent = z.infer<typeof dialRecipeEventSchema>;
export type BeginDialConnectionIntent = z.infer<typeof beginDialConnectionIntentSchema>;
export type ConsumeDialConnectionIntent = z.infer<typeof consumeDialConnectionIntentSchema>;
export type DialBackfillRequest = z.infer<typeof dialBackfillRequestSchema>;
export type DialEditCapabilityRequest = z.infer<typeof dialEditCapabilityRequestSchema>;
