import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "@/db/schema";
import {
  DIAL_INTEGRATION_CONTRACT,
  DIAL_INTEGRATION_VERSION,
  type BeginDialConnectionIntent,
  type DialBackfillRequest,
  type DialEditCapabilityRequest,
  type DialRecipeEvent,
  type DialRecipeProjection,
} from "@/lib/dial-contract";

type DialDatabase = DrizzleD1Database<typeof schema>;
type RecipeRecord = typeof schema.recipesTable.$inferSelect;

const CONNECTION_INTENT_TTL_MS = 10 * 60 * 1000;

export interface DialRuntimeConfiguration {
  appOrigin: string;
  dialAppOrigin: string;
}

export interface DialAvailability {
  eligible: boolean;
  state: "available" | "awaiting_team_pairing" | "not_eligible" | "pending_delivery";
  detail: string;
  externalId?: string;
  openUrl?: string;
  deliveryStatus?: string;
}

export function dialRecipeOpenUrl({
  dialAppOrigin,
  externalId,
}: {
  dialAppOrigin: string;
  externalId: string;
}): string {
  return `${dialAppOrigin}/drinks/${encodeURIComponent(externalId)}`;
}

interface RecordRecipeEventInput {
  current: RecipeRecord | null;
  previous: RecipeRecord | null;
  reason?: DialRecipeEvent["reason"];
}

interface IntentApprovalInput {
  intentToken: string;
  teamId?: string;
  userId: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateReturnUrl({ dialAppOrigin, returnUrl }: { dialAppOrigin: string; returnUrl: string }): string {
  const parsed = new URL(returnUrl);
  if (parsed.origin !== new URL(dialAppOrigin).origin) throw new Error("INVALID_RETURN_URL");
  return parsed.toString();
}

function normalizeIngredients(ingredients: RecipeRecord["ingredients"]): DialRecipeProjection["ingredients"] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.flatMap((section) => {
    if (!section || !Array.isArray(section.items)) return [];
    return [{
      ...(section.title ? { title: section.title } : {}),
      items: section.items.filter((item): item is string => typeof item === "string"),
    }];
  });
}

function recipeProjection({ appOrigin, recipe, revision }: {
  appOrigin: string;
  recipe: RecipeRecord;
  revision: number;
}): DialRecipeProjection {
  const externalId = recipe.dialExternalId;
  if (!externalId) throw new Error("DIAL_RECIPE_ID_REQUIRED");
  return {
    id: externalId,
    revision,
    type: "coffee_drink",
    name: recipe.name,
    emoji: recipe.emoji,
    tags: recipe.tags ?? [],
    ingredients: normalizeIngredients(recipe.ingredients),
    instructions: recipe.recipeBody,
    visibility: recipe.visibility as DialRecipeProjection["visibility"],
    listoUrl: `${appOrigin}/integrations/dial/recipes/${encodeURIComponent(externalId)}`,
  };
}

async function activeTeamPairing({ db, teamId }: { db: DialDatabase; teamId: string }) {
  return db.query.dialTeamPairingsTable.findFirst({
    where: and(
      eq(schema.dialTeamPairingsTable.teamId, teamId),
      eq(schema.dialTeamPairingsTable.isActive, true),
    ),
  });
}

async function hasTeamPermission({
  db,
  permission,
  teamId,
  userId,
}: {
  db: DialDatabase;
  permission: string;
  teamId: string;
  userId: string;
}) {
  const membership = await db.query.teamMembershipTable.findFirst({
    where: and(
      eq(schema.teamMembershipTable.userId, userId),
      eq(schema.teamMembershipTable.teamId, teamId),
      eq(schema.teamMembershipTable.isActive, 1),
    ),
  });
  if (!membership) return false;
  if (membership.isSystemRole) {
    if (membership.roleId === schema.SYSTEM_ROLES_ENUM.OWNER) return true;
    if (membership.roleId === schema.SYSTEM_ROLES_ENUM.ADMIN) return true;
    return membership.roleId === schema.SYSTEM_ROLES_ENUM.MEMBER
      && permission === schema.TEAM_PERMISSIONS.EDIT_RECIPES;
  }
  const role = await db.query.teamRoleTable.findFirst({
    where: and(
      eq(schema.teamRoleTable.id, membership.roleId),
      eq(schema.teamRoleTable.teamId, teamId),
    ),
  });
  return role?.permissions.includes(permission) ?? false;
}

export function createDialRepository({ configuration, db }: {
  configuration: DialRuntimeConfiguration;
  db: DialDatabase;
}) {
  async function ensureRecipeIdentity(recipe: RecipeRecord): Promise<RecipeRecord> {
    if (recipe.dialExternalId) return recipe;
    const dialExternalId = `lst_recipe_${createId()}`;
    const [updated] = await db.update(schema.recipesTable)
      .set({ dialExternalId })
      .where(and(eq(schema.recipesTable.id, recipe.id), isNull(schema.recipesTable.dialExternalId)))
      .returning();
    if (updated) return updated;
    const current = await db.query.recipesTable.findFirst({ where: eq(schema.recipesTable.id, recipe.id) });
    if (!current?.dialExternalId) throw new Error("DIAL_RECIPE_ID_ALLOCATION_FAILED");
    return current;
  }

  async function recordRecipeEvent({ current, previous, reason }: RecordRecipeEventInput) {
    const wasCoffee = previous?.recipeType === schema.RECIPE_TYPES.COFFEE_DRINK;
    const isCoffee = current?.recipeType === schema.RECIPE_TYPES.COFFEE_DRINK;
    if (!wasCoffee && !isCoffee) return null;

    const source = current ?? previous;
    if (!source) return null;
    const identitySource = await ensureRecipeIdentity(source);
    const externalId = identitySource.dialExternalId!;
    const revision = Math.max(previous?.dialRevision ?? 0, current?.dialRevision ?? 0) + 1;
    const [versionedRecipe] = await db.update(schema.recipesTable)
      .set({ dialExternalId: externalId, dialRevision: revision })
      .where(eq(schema.recipesTable.id, identitySource.id))
      .returning();
    const canonical = versionedRecipe ?? { ...identitySource, dialRevision: revision };
    const occurredAt = new Date().toISOString();
    const eventKey = `${externalId}:v${revision}`;
    let event: DialRecipeEvent;

    if (!current || !isCoffee) {
      event = {
        contract: DIAL_INTEGRATION_CONTRACT,
        schemaVersion: DIAL_INTEGRATION_VERSION,
        eventId: eventKey,
        eventType: "recipe.withdraw",
        occurredAt,
        recipeId: externalId,
        revision,
        reason: reason ?? (current ? "recipe_type_changed" : "recipe_deleted"),
      };
    } else if (current.visibility === schema.RECIPE_VISIBILITY.PRIVATE) {
      const pairing = await activeTeamPairing({ db, teamId: current.teamId });
      if (!pairing) {
        event = {
          contract: DIAL_INTEGRATION_CONTRACT,
          schemaVersion: DIAL_INTEGRATION_VERSION,
          eventId: eventKey,
          eventType: "recipe.withdraw",
          occurredAt,
          recipeId: externalId,
          revision,
          reason: reason ?? "team_pairing_required",
        };
      } else {
        event = {
          contract: DIAL_INTEGRATION_CONTRACT,
          schemaVersion: DIAL_INTEGRATION_VERSION,
          eventId: eventKey,
          eventType: "recipe.upsert",
          occurredAt,
          recipeId: externalId,
          revision,
          audience: { scope: "paired_team", teamPairingId: pairing.id },
          recipe: recipeProjection({ appOrigin: configuration.appOrigin, recipe: canonical, revision }),
        };
      }
    } else {
      event = {
        contract: DIAL_INTEGRATION_CONTRACT,
        schemaVersion: DIAL_INTEGRATION_VERSION,
        eventId: eventKey,
        eventType: "recipe.upsert",
        occurredAt,
        recipeId: externalId,
        revision,
        audience: {
          scope: current.visibility === schema.RECIPE_VISIBILITY.PUBLIC ? "global" : "direct_link",
        },
        recipe: recipeProjection({ appOrigin: configuration.appOrigin, recipe: canonical, revision }),
      };
    }

    await db.insert(schema.dialRecipeEventsTable).values({
      eventKey,
      recipeId: source.id,
      recipeExternalId: externalId,
      revision,
      eventType: event.eventType,
      payload: event,
    }).onConflictDoNothing({ target: schema.dialRecipeEventsTable.eventKey });

    const stored = await db.query.dialRecipeEventsTable.findFirst({
      where: eq(schema.dialRecipeEventsTable.eventKey, eventKey),
    });
    if (!stored) throw new Error("DIAL_EVENT_OUTBOX_WRITE_FAILED");
    return { event, eventId: stored.id, eventKey };
  }

  async function beginConnectionIntent(input: BeginDialConnectionIntent) {
    const intentToken = createOpaqueToken();
    const tokenHash = await hashToken(intentToken);
    const returnUrl = validateReturnUrl({ dialAppOrigin: configuration.dialAppOrigin, returnUrl: input.returnUrl });
    const expiresAt = new Date(Date.now() + CONNECTION_INTENT_TTL_MS);
    await db.insert(schema.dialConnectionIntentsTable).values({
      tokenHash,
      requestedScopes: [...new Set(input.requestedScopes)],
      dialUserRef: input.dialUserRef,
      dialUserLabel: input.dialUserLabel,
      dialTeamRef: input.dialTeamRef,
      dialTeamLabel: input.dialTeamLabel,
      emailHint: input.emailHint,
      returnUrl,
      expiresAt,
    });
    return {
      approvalUrl: `${configuration.appOrigin}/integrations/dial/connect?intent=${encodeURIComponent(intentToken)}`,
      expiresAt: expiresAt.toISOString(),
      intentToken,
    };
  }

  async function findConnectionIntent(intentToken: string) {
    const tokenHash = await hashToken(intentToken);
    return db.query.dialConnectionIntentsTable.findFirst({
      where: eq(schema.dialConnectionIntentsTable.tokenHash, tokenHash),
    });
  }

  async function approveConnectionIntent({ intentToken, teamId, userId }: IntentApprovalInput) {
    const intent = await findConnectionIntent(intentToken);
    if (!intent || intent.expiresAt <= new Date()) throw new Error("INTENT_INVALID_OR_EXPIRED");
    if (intent.status !== "pending") throw new Error("INTENT_NOT_PENDING");
    if (intent.requestedScopes.includes("team")) {
      if (!teamId) throw new Error("TEAM_REQUIRED");
      const canManageTeam = await hasTeamPermission({
        db,
        permission: schema.TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS,
        teamId,
        userId,
      });
      if (!canManageTeam) throw new Error("FORBIDDEN");
    }
    const [approved] = await db.update(schema.dialConnectionIntentsTable).set({
      approvedByUserId: userId,
      approvedTeamId: intent.requestedScopes.includes("team") ? teamId : null,
      approvedAt: new Date(),
      status: "approved",
    }).where(and(
      eq(schema.dialConnectionIntentsTable.id, intent.id),
      eq(schema.dialConnectionIntentsTable.status, "pending"),
    )).returning();
    if (!approved) throw new Error("INTENT_NOT_PENDING");
    const returnUrl = new URL(approved.returnUrl);
    returnUrl.searchParams.set("listo_intent", intentToken);
    return { intent: approved, returnUrl: returnUrl.toString() };
  }

  async function consumeConnectionIntent(intentToken: string) {
    const intent = await findConnectionIntent(intentToken);
    if (!intent || intent.expiresAt <= new Date()) throw new Error("INTENT_INVALID_OR_EXPIRED");
    if (intent.status === "consumed" && intent.result) return { ...intent.result, replayed: true };
    if (intent.status !== "approved" || !intent.approvedByUserId) throw new Error("INTENT_NOT_APPROVED");

    let accountLinkId: string | undefined;
    let teamPairingId: string | undefined;
    if (intent.requestedScopes.includes("account")) {
      if (!intent.dialUserRef) throw new Error("DIAL_USER_REQUIRED");
      const existingDialLink = await db.query.dialAccountLinksTable.findFirst({
        where: eq(schema.dialAccountLinksTable.dialUserRef, intent.dialUserRef),
      });
      if (existingDialLink && existingDialLink.userId !== intent.approvedByUserId) {
        throw new Error("DIAL_ACCOUNT_ALREADY_LINKED");
      }
      await db.insert(schema.dialAccountLinksTable).values({
        userId: intent.approvedByUserId,
        dialUserRef: intent.dialUserRef,
        dialUserLabel: intent.dialUserLabel,
      }).onConflictDoUpdate({
        target: schema.dialAccountLinksTable.userId,
        set: {
          dialUserRef: intent.dialUserRef,
          dialUserLabel: intent.dialUserLabel,
          isActive: true,
          disconnectedAt: null,
        },
      });
      accountLinkId = (await db.query.dialAccountLinksTable.findFirst({
        where: eq(schema.dialAccountLinksTable.userId, intent.approvedByUserId),
      }))?.id;
    }
    if (intent.requestedScopes.includes("team")) {
      if (!intent.dialTeamRef || !intent.approvedTeamId) throw new Error("DIAL_TEAM_REQUIRED");
      const existingDialPairing = await db.query.dialTeamPairingsTable.findFirst({
        where: eq(schema.dialTeamPairingsTable.dialTeamRef, intent.dialTeamRef),
      });
      if (existingDialPairing && existingDialPairing.teamId !== intent.approvedTeamId) {
        throw new Error("DIAL_TEAM_ALREADY_PAIRED");
      }
      await db.insert(schema.dialTeamPairingsTable).values({
        teamId: intent.approvedTeamId,
        dialTeamRef: intent.dialTeamRef,
        dialTeamLabel: intent.dialTeamLabel,
        connectedByUserId: intent.approvedByUserId,
      }).onConflictDoUpdate({
        target: schema.dialTeamPairingsTable.teamId,
        set: {
          dialTeamRef: intent.dialTeamRef,
          dialTeamLabel: intent.dialTeamLabel,
          connectedByUserId: intent.approvedByUserId,
          isActive: true,
          disconnectedAt: null,
        },
      });
      teamPairingId = (await db.query.dialTeamPairingsTable.findFirst({
        where: eq(schema.dialTeamPairingsTable.teamId, intent.approvedTeamId),
      }))?.id;
    }
    const result = { ...(accountLinkId ? { accountLinkId } : {}), ...(teamPairingId ? { teamPairingId } : {}) };
    await db.update(schema.dialConnectionIntentsTable).set({
      consumedAt: new Date(),
      result,
      status: "consumed",
    }).where(eq(schema.dialConnectionIntentsTable.id, intent.id));
    return { ...result, replayed: false };
  }

  async function getBackfill(input: DialBackfillRequest) {
    let privateTeamId: string | undefined;
    if (input.teamPairingId) {
      const pairing = await db.query.dialTeamPairingsTable.findFirst({
        where: and(
          eq(schema.dialTeamPairingsTable.id, input.teamPairingId),
          eq(schema.dialTeamPairingsTable.isActive, true),
        ),
      });
      privateTeamId = pairing?.teamId;
    }
    const visibility = privateTeamId
      ? or(
          inArray(schema.recipesTable.visibility, [schema.RECIPE_VISIBILITY.PUBLIC, schema.RECIPE_VISIBILITY.UNLISTED]),
          and(eq(schema.recipesTable.visibility, schema.RECIPE_VISIBILITY.PRIVATE), eq(schema.recipesTable.teamId, privateTeamId)),
        )
      : inArray(schema.recipesTable.visibility, [schema.RECIPE_VISIBILITY.PUBLIC, schema.RECIPE_VISIBILITY.UNLISTED]);
    const conditions = [eq(schema.recipesTable.recipeType, schema.RECIPE_TYPES.COFFEE_DRINK), visibility];
    if (input.cursor) conditions.push(gt(schema.recipesTable.dialExternalId, input.cursor));
    const rows = await db.query.recipesTable.findMany({
      where: and(...conditions),
      orderBy: [asc(schema.recipesTable.dialExternalId)],
      limit: input.limit + 1,
    });
    const page = rows.slice(0, input.limit);
    const projections = await Promise.all(page.map(async (row) => {
      const recipe = await ensureRecipeIdentity(row);
      const revision = Math.max(1, recipe.dialRevision);
      const pairing = recipe.visibility === schema.RECIPE_VISIBILITY.PRIVATE
        ? await activeTeamPairing({ db, teamId: recipe.teamId })
        : null;
      return {
        audience: recipe.visibility === schema.RECIPE_VISIBILITY.PUBLIC
          ? { scope: "global" as const }
          : recipe.visibility === schema.RECIPE_VISIBILITY.UNLISTED
            ? { scope: "direct_link" as const }
            : { scope: "paired_team" as const, teamPairingId: pairing!.id },
        recipe: recipeProjection({ appOrigin: configuration.appOrigin, recipe, revision }),
      };
    }));
    return {
      contract: DIAL_INTEGRATION_CONTRACT,
      schemaVersion: DIAL_INTEGRATION_VERSION,
      items: projections,
      nextCursor: rows.length > input.limit ? projections.at(-1)?.recipe.id : undefined,
    };
  }

  async function checkEditCapability(input: DialEditCapabilityRequest) {
    const [link, recipe] = await Promise.all([
      db.query.dialAccountLinksTable.findFirst({
        where: and(
          eq(schema.dialAccountLinksTable.id, input.accountLinkId),
          eq(schema.dialAccountLinksTable.isActive, true),
        ),
      }),
      db.query.recipesTable.findFirst({
        where: and(
          eq(schema.recipesTable.dialExternalId, input.recipeId),
          eq(schema.recipesTable.recipeType, schema.RECIPE_TYPES.COFFEE_DRINK),
        ),
      }),
    ]);
    if (!link || !recipe) return { canEdit: false };
    const canEdit = await hasTeamPermission({
      db,
      permission: schema.TEAM_PERMISSIONS.EDIT_RECIPES,
      teamId: recipe.teamId,
      userId: link.userId,
    });
    return canEdit
      ? { canEdit: true, editUrl: `${configuration.appOrigin}/integrations/dial/recipes/${recipe.dialExternalId}/edit` }
      : { canEdit: false };
  }

  async function availabilityForRecipe(recipe: RecipeRecord): Promise<DialAvailability> {
    if (recipe.recipeType !== schema.RECIPE_TYPES.COFFEE_DRINK) {
      return { eligible: false, state: "not_eligible", detail: "Choose Coffee drink to make this recipe available in Dial." };
    }
    const externalId = recipe.dialExternalId ?? undefined;
    const openUrl = externalId
      ? dialRecipeOpenUrl({
        dialAppOrigin: configuration.dialAppOrigin,
        externalId,
      })
      : undefined;
    if (recipe.visibility === schema.RECIPE_VISIBILITY.PRIVATE) {
      const pairing = await activeTeamPairing({ db, teamId: recipe.teamId });
      if (!pairing) {
        return {
          eligible: true,
          state: "awaiting_team_pairing",
          detail: "Connect this Listo team to a Dial team to share this private coffee drink.",
          externalId,
        };
      }
    }
    const latestEvent = externalId ? await db.query.dialRecipeEventsTable.findFirst({
      where: eq(schema.dialRecipeEventsTable.recipeExternalId, externalId),
      orderBy: (table, { desc }) => [desc(table.revision)],
    }) : null;
    const state = latestEvent?.status === "queued" || latestEvent?.status === "delivered"
      ? "available"
      : "pending_delivery";
    return {
      eligible: true,
      state,
      detail: state === "available"
        ? "Available in Dial Your Espresso. Listo remains the source of truth."
        : "Eligible for Dial. Delivery continues in the background.",
      externalId,
      openUrl,
      deliveryStatus: latestEvent?.status,
    };
  }

  async function getConnectionStatus({ teamId, userId }: { teamId?: string; userId: string }) {
    const [accountLink, teamPairing] = await Promise.all([
      db.query.dialAccountLinksTable.findFirst({
        where: and(
          eq(schema.dialAccountLinksTable.userId, userId),
          eq(schema.dialAccountLinksTable.isActive, true),
        ),
      }),
      teamId
        ? db.query.dialTeamPairingsTable.findFirst({
            where: and(
              eq(schema.dialTeamPairingsTable.teamId, teamId),
              eq(schema.dialTeamPairingsTable.isActive, true),
            ),
          })
        : Promise.resolve(undefined),
    ]);
    return {
      account: accountLink
        ? { connected: true as const, label: accountLink.dialUserLabel ?? "Linked Dial account" }
        : { connected: false as const },
      team: teamPairing
        ? { connected: true as const, label: teamPairing.dialTeamLabel ?? "Paired Dial team" }
        : { connected: false as const },
    };
  }

  async function disconnectAccount(userId: string) {
    await db.update(schema.dialAccountLinksTable).set({
      disconnectedAt: new Date(),
      isActive: false,
    }).where(eq(schema.dialAccountLinksTable.userId, userId));
  }

  async function disconnectTeam(teamId: string) {
    await db.update(schema.dialTeamPairingsTable).set({
      disconnectedAt: new Date(),
      isActive: false,
    }).where(eq(schema.dialTeamPairingsTable.teamId, teamId));
  }

  return {
    approveConnectionIntent,
    availabilityForRecipe,
    beginConnectionIntent,
    checkEditCapability,
    consumeConnectionIntent,
    disconnectAccount,
    disconnectTeam,
    findConnectionIntent,
    getBackfill,
    getConnectionStatus,
    recordRecipeEvent,
  };
}
