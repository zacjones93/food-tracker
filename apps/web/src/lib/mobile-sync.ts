import "server-only";

import { getDB } from "@/db";
import {
  groceryItemsTable,
  groceryListTemplatesTable,
  recipeBooksTable,
  recipeRelationsTable,
  recipesTable,
  syncChangesTable,
  syncEntitiesTable,
  syncMutationsTable,
  TEAM_PERMISSIONS,
  weekRecipesTable,
  weeksTable,
} from "@/db/schema";
import { MobileAPIError } from "@/lib/mobile-auth";
import {
  groceryItemPayloadSchema,
  groceryTemplatePayloadSchema,
  type MobileEntityType,
  type MobileMutation,
  recipeBookPayloadSchema,
  recipePayloadSchema,
  recipeRelationPayloadSchema,
  weekPayloadSchema,
  weekRecipePayloadSchema,
} from "@/lib/mobile-sync-contract";
import { and, eq, gt, isNull, or } from "drizzle-orm";

interface ApplyMobileMutationsParams {
  mutations: MobileMutation[];
  permissions: string[];
  teamId: string;
  userId: string;
}

interface OwnedEntity {
  id: string;
  record: Record<string, unknown>;
  updatedAt: Date | null;
}

const entityPermissions: Record<
  MobileEntityType,
  Record<MobileMutation["operation"], string>
> = {
  recipe: {
    create: TEAM_PERMISSIONS.CREATE_RECIPES,
    update: TEAM_PERMISSIONS.EDIT_RECIPES,
    delete: TEAM_PERMISSIONS.DELETE_RECIPES,
  },
  recipeBook: {
    create: TEAM_PERMISSIONS.CREATE_RECIPES,
    update: TEAM_PERMISSIONS.EDIT_RECIPES,
    delete: TEAM_PERMISSIONS.DELETE_RECIPES,
  },
  recipeRelation: {
    create: TEAM_PERMISSIONS.EDIT_RECIPES,
    update: TEAM_PERMISSIONS.EDIT_RECIPES,
    delete: TEAM_PERMISSIONS.EDIT_RECIPES,
  },
  week: {
    create: TEAM_PERMISSIONS.CREATE_SCHEDULES,
    update: TEAM_PERMISSIONS.EDIT_SCHEDULES,
    delete: TEAM_PERMISSIONS.DELETE_SCHEDULES,
  },
  weekRecipe: {
    create: TEAM_PERMISSIONS.EDIT_SCHEDULES,
    update: TEAM_PERMISSIONS.EDIT_SCHEDULES,
    delete: TEAM_PERMISSIONS.EDIT_SCHEDULES,
  },
  groceryItem: {
    create: TEAM_PERMISSIONS.EDIT_SCHEDULES,
    update: TEAM_PERMISSIONS.EDIT_SCHEDULES,
    delete: TEAM_PERMISSIONS.EDIT_SCHEDULES,
  },
  groceryTemplate: {
    create: TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES,
    update: TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES,
    delete: TEAM_PERMISSIONS.DELETE_GROCERY_TEMPLATES,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function getUpdatedAt(record: Record<string, unknown>) {
  const value = record.updatedAt ?? record.createdAt;
  return value instanceof Date ? value : null;
}

async function resolveReference({
  clientOrServerId,
  entityType,
  teamId,
}: {
  clientOrServerId: string;
  entityType: MobileEntityType;
  teamId: string;
}) {
  const db = getDB();
  const mapping = await db.query.syncEntitiesTable.findFirst({
    where: and(
      eq(syncEntitiesTable.teamId, teamId),
      eq(syncEntitiesTable.entityType, entityType),
      eq(syncEntitiesTable.clientId, clientOrServerId),
    ),
  });

  return mapping?.entityId ?? clientOrServerId;
}

async function findOwnedEntity({
  entityId,
  entityType,
  teamId,
}: {
  entityId: string;
  entityType: MobileEntityType;
  teamId: string;
}): Promise<OwnedEntity | null> {
  const db = getDB();

  switch (entityType) {
    case "recipe": {
      const record = await db.query.recipesTable.findFirst({
        where: and(eq(recipesTable.id, entityId), eq(recipesTable.teamId, teamId)),
      });
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "week": {
      const record = await db.query.weeksTable.findFirst({
        where: and(eq(weeksTable.id, entityId), eq(weeksTable.teamId, teamId)),
      });
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "groceryTemplate": {
      const record = await db.query.groceryListTemplatesTable.findFirst({
        where: and(
          eq(groceryListTemplatesTable.id, entityId),
          eq(groceryListTemplatesTable.teamId, teamId),
        ),
      });
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "weekRecipe": {
      const rows = await db
        .select({ record: weekRecipesTable })
        .from(weekRecipesTable)
        .innerJoin(weeksTable, eq(weekRecipesTable.weekId, weeksTable.id))
        .where(and(eq(weekRecipesTable.id, entityId), eq(weeksTable.teamId, teamId)))
        .limit(1);
      const record = rows[0]?.record;
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "groceryItem": {
      const rows = await db
        .select({ record: groceryItemsTable })
        .from(groceryItemsTable)
        .innerJoin(weeksTable, eq(groceryItemsTable.weekId, weeksTable.id))
        .where(and(eq(groceryItemsTable.id, entityId), eq(weeksTable.teamId, teamId)))
        .limit(1);
      const record = rows[0]?.record;
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "recipeRelation": {
      const rows = await db
        .select({ record: recipeRelationsTable })
        .from(recipeRelationsTable)
        .innerJoin(recipesTable, eq(recipeRelationsTable.mainRecipeId, recipesTable.id))
        .where(and(eq(recipeRelationsTable.id, entityId), eq(recipesTable.teamId, teamId)))
        .limit(1);
      const record = rows[0]?.record;
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "recipeBook": {
      const syncOwner = await db.query.syncEntitiesTable.findFirst({
        where: and(
          eq(syncEntitiesTable.teamId, teamId),
          eq(syncEntitiesTable.entityType, "recipeBook"),
          eq(syncEntitiesTable.entityId, entityId),
        ),
      });
      const record = await db.query.recipeBooksTable.findFirst({
        where: eq(recipeBooksTable.id, entityId),
      });
      if (!record || (record.teamId !== teamId && !syncOwner)) return null;
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
  }
}

async function findByClientId({
  clientEntityId,
  entityType,
  teamId,
}: {
  clientEntityId: string;
  entityType: MobileEntityType;
  teamId: string;
}) {
  const db = getDB();
  const mapping = await db.query.syncEntitiesTable.findFirst({
    where: and(
      eq(syncEntitiesTable.teamId, teamId),
      eq(syncEntitiesTable.entityType, entityType),
      eq(syncEntitiesTable.clientId, clientEntityId),
    ),
  });
  if (mapping?.deletedAt) {
    throw new MobileAPIError(409, "That client entity ID was retired by a delete");
  }
  if (mapping) return findOwnedEntity({ entityId: mapping.entityId, entityType, teamId });

  switch (entityType) {
    case "recipe": {
      const record = await db.query.recipesTable.findFirst({
        where: and(eq(recipesTable.teamId, teamId), eq(recipesTable.clientId, clientEntityId)),
      });
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "week": {
      const record = await db.query.weeksTable.findFirst({
        where: and(eq(weeksTable.teamId, teamId), eq(weeksTable.clientId, clientEntityId)),
      });
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "groceryTemplate": {
      const record = await db.query.groceryListTemplatesTable.findFirst({
        where: and(
          eq(groceryListTemplatesTable.teamId, teamId),
          eq(groceryListTemplatesTable.clientId, clientEntityId),
        ),
      });
      return record ? { id: record.id, record: asRecord(record), updatedAt: record.updatedAt } : null;
    }
    case "recipeBook": {
      const record = await db.query.recipeBooksTable.findFirst({
        where: eq(recipeBooksTable.clientId, clientEntityId),
      });
      if (!record) return null;
      const owned = await findOwnedEntity({ entityId: record.id, entityType, teamId });
      if (!owned) throw new MobileAPIError(409, "That client ID belongs to another team");
      return owned;
    }
    case "weekRecipe":
    case "groceryItem":
    case "recipeRelation": {
      const table =
        entityType === "weekRecipe"
          ? weekRecipesTable
          : entityType === "groceryItem"
            ? groceryItemsTable
            : recipeRelationsTable;
      const rows = await db.select({ id: table.id }).from(table).where(eq(table.clientId, clientEntityId)).limit(1);
      return rows[0]
        ? findOwnedEntity({ entityId: rows[0].id, entityType, teamId })
        : null;
    }
  }
}

async function assertReferencesOwned({
  entityType,
  payload,
  teamId,
}: {
  entityType: MobileEntityType;
  payload: Record<string, unknown>;
  teamId: string;
}) {
  const references: Array<{ field: string; type: MobileEntityType }> = [];
  if (entityType === "groceryItem") references.push({ field: "weekId", type: "week" });
  if (entityType === "weekRecipe") {
    references.push({ field: "weekId", type: "week" }, { field: "recipeId", type: "recipe" });
    if (typeof payload.scheduledForWeekRecipeId === "string") {
      references.push({ field: "scheduledForWeekRecipeId", type: "weekRecipe" });
    }
    if (typeof payload.sourceRecipeRelationId === "string") {
      references.push({ field: "sourceRecipeRelationId", type: "recipeRelation" });
    }
  }
  if (entityType === "recipeRelation") {
    references.push(
      { field: "mainRecipeId", type: "recipe" },
      { field: "sideRecipeId", type: "recipe" },
    );
  }
  if (entityType === "recipe" && typeof payload.recipeBookId === "string") {
    references.push({ field: "recipeBookId", type: "recipeBook" });
  }

  for (const reference of references) {
    const value = payload[reference.field];
    if (typeof value !== "string") continue;
    const resolved = await resolveReference({ clientOrServerId: value, entityType: reference.type, teamId });
    if (reference.type === "recipeBook") {
      const readableBook = await getDB().query.recipeBooksTable.findFirst({
        where: and(
          eq(recipeBooksTable.id, resolved),
          or(eq(recipeBooksTable.teamId, teamId), isNull(recipeBooksTable.teamId)),
        ),
      });
      if (!readableBook) throw new MobileAPIError(404, "recipeBookId was not found");
      payload[reference.field] = resolved;
      continue;
    }
    const owned = await findOwnedEntity({ entityId: resolved, entityType: reference.type, teamId });
    if (!owned) throw new MobileAPIError(404, `${reference.field} was not found in the active team`);
    payload[reference.field] = resolved;
  }
}

function parsePayload({
  entityType,
  operation,
  payload,
}: Pick<MobileMutation, "entityType" | "operation" | "payload">) {
  const isUpdate = operation === "update";
  switch (entityType) {
    case "recipe":
      return (isUpdate ? recipePayloadSchema.partial() : recipePayloadSchema).parse(payload);
    case "week":
      return (isUpdate ? weekPayloadSchema.partial() : weekPayloadSchema).parse(payload);
    case "weekRecipe":
      return (isUpdate ? weekRecipePayloadSchema.partial() : weekRecipePayloadSchema).parse(payload);
    case "groceryItem":
      return (isUpdate ? groceryItemPayloadSchema.partial() : groceryItemPayloadSchema).parse(payload);
    case "recipeBook":
      return (isUpdate ? recipeBookPayloadSchema.partial() : recipeBookPayloadSchema).parse(payload);
    case "groceryTemplate":
      return (isUpdate ? groceryTemplatePayloadSchema.partial() : groceryTemplatePayloadSchema).parse(payload);
    case "recipeRelation":
      return (isUpdate ? recipeRelationPayloadSchema.partial() : recipeRelationPayloadSchema).parse(payload);
  }
}

async function createEntity({
  clientEntityId,
  entityType,
  payload,
  teamId,
}: {
  clientEntityId: string;
  entityType: MobileEntityType;
  payload: Record<string, unknown>;
  teamId: string;
}) {
  const db = getDB();
  await assertReferencesOwned({ entityType, payload, teamId });

  switch (entityType) {
    case "recipe": {
      const values = recipePayloadSchema.parse(payload);
      const [record] = await db.insert(recipesTable).values({ ...values, clientId: clientEntityId, teamId }).returning();
      return record;
    }
    case "week": {
      const values = weekPayloadSchema.parse(payload);
      const [record] = await db.insert(weeksTable).values({ ...values, clientId: clientEntityId, teamId }).returning();
      return record;
    }
    case "weekRecipe": {
      const values = weekRecipePayloadSchema.parse(payload);
      const [record] = await db.insert(weekRecipesTable).values({ ...values, clientId: clientEntityId }).returning();
      return record;
    }
    case "groceryItem": {
      const values = groceryItemPayloadSchema.parse(payload);
      const [record] = await db.insert(groceryItemsTable).values({ ...values, clientId: clientEntityId }).returning();
      return record;
    }
    case "recipeBook": {
      const values = recipeBookPayloadSchema.parse(payload);
      const [record] = await db.insert(recipeBooksTable).values({ ...values, clientId: clientEntityId, teamId }).returning();
      return record;
    }
    case "groceryTemplate": {
      const values = groceryTemplatePayloadSchema.parse(payload);
      const [record] = await db
        .insert(groceryListTemplatesTable)
        .values({ ...values, clientId: clientEntityId, teamId })
        .returning();
      return record;
    }
    case "recipeRelation": {
      const values = recipeRelationPayloadSchema.parse(payload);
      const [record] = await db.insert(recipeRelationsTable).values({ ...values, clientId: clientEntityId }).returning();
      return record;
    }
  }
}

async function updateEntity({
  entityId,
  entityType,
  payload,
  teamId,
}: {
  entityId: string;
  entityType: MobileEntityType;
  payload: Record<string, unknown>;
  teamId: string;
}) {
  const db = getDB();
  await assertReferencesOwned({ entityType, payload, teamId });

  switch (entityType) {
    case "recipe": {
      const values = recipePayloadSchema.partial().parse(payload);
      const [record] = await db.update(recipesTable).set(values).where(and(eq(recipesTable.id, entityId), eq(recipesTable.teamId, teamId))).returning();
      return record;
    }
    case "week": {
      const values = weekPayloadSchema.partial().parse(payload);
      const [record] = await db.update(weeksTable).set(values).where(and(eq(weeksTable.id, entityId), eq(weeksTable.teamId, teamId))).returning();
      return record;
    }
    case "weekRecipe": {
      const values = weekRecipePayloadSchema.partial().parse(payload);
      const [record] = await db.update(weekRecipesTable).set(values).where(eq(weekRecipesTable.id, entityId)).returning();
      return record;
    }
    case "groceryItem": {
      const values = groceryItemPayloadSchema.partial().parse(payload);
      const [record] = await db.update(groceryItemsTable).set(values).where(eq(groceryItemsTable.id, entityId)).returning();
      return record;
    }
    case "recipeBook": {
      const values = recipeBookPayloadSchema.partial().parse(payload);
      const [record] = await db.update(recipeBooksTable).set(values).where(eq(recipeBooksTable.id, entityId)).returning();
      return record;
    }
    case "groceryTemplate": {
      const values = groceryTemplatePayloadSchema.partial().parse(payload);
      const [record] = await db
        .update(groceryListTemplatesTable)
        .set(values)
        .where(and(eq(groceryListTemplatesTable.id, entityId), eq(groceryListTemplatesTable.teamId, teamId)))
        .returning();
      return record;
    }
    case "recipeRelation": {
      const values = recipeRelationPayloadSchema.partial().parse(payload);
      const [record] = await db.update(recipeRelationsTable).set(values).where(eq(recipeRelationsTable.id, entityId)).returning();
      return record;
    }
  }
}

async function deleteEntity({ entityId, entityType, teamId }: { entityId: string; entityType: MobileEntityType; teamId: string }) {
  const db = getDB();
  switch (entityType) {
    case "recipe":
      await db.delete(recipesTable).where(and(eq(recipesTable.id, entityId), eq(recipesTable.teamId, teamId)));
      break;
    case "week":
      await db.delete(weeksTable).where(and(eq(weeksTable.id, entityId), eq(weeksTable.teamId, teamId)));
      break;
    case "groceryTemplate":
      await db.delete(groceryListTemplatesTable).where(and(eq(groceryListTemplatesTable.id, entityId), eq(groceryListTemplatesTable.teamId, teamId)));
      break;
    case "weekRecipe":
      await db.delete(weekRecipesTable).where(eq(weekRecipesTable.id, entityId));
      break;
    case "groceryItem":
      await db.delete(groceryItemsTable).where(eq(groceryItemsTable.id, entityId));
      break;
    case "recipeRelation":
      await db.delete(recipeRelationsTable).where(eq(recipeRelationsTable.id, entityId));
      break;
    case "recipeBook":
      await db.delete(recipeBooksTable).where(eq(recipeBooksTable.id, entityId));
      break;
  }
}

async function findConflict({
  current,
  mutation,
  teamId,
}: {
  current: OwnedEntity;
  mutation: MobileMutation;
  teamId: string;
}) {
  const db = getDB();
  const entityType = mutation.entityType;
  if (!entityType) throw new MobileAPIError(400, "Missing entity type");
  const syncEntity = await db.query.syncEntitiesTable.findFirst({
    where: and(
      eq(syncEntitiesTable.teamId, teamId),
      eq(syncEntitiesTable.entityType, entityType),
      eq(syncEntitiesTable.entityId, current.id),
    ),
  });

  if (syncEntity && mutation.baseVersion < syncEntity.version) {
    if (mutation.operation === "delete") {
      return { version: syncEntity.version, conflictingFields: ["*"] };
    }
    const laterChanges = await db.query.syncChangesTable.findMany({
      where: and(
        eq(syncChangesTable.teamId, teamId),
        eq(syncChangesTable.entityType, entityType),
        eq(syncChangesTable.entityId, current.id),
        gt(syncChangesTable.version, mutation.baseVersion),
      ),
    });
    const serverFields = new Set(laterChanges.flatMap((change) => change.changedFields));
    const conflictingFields = mutation.changedFields.filter((field) => serverFields.has(field));
    if (conflictingFields.length > 0) return { version: syncEntity.version, conflictingFields };
  }

  // Existing web actions do not yet emit sync_changes, so the domain timestamp
  // remains the authoritative guard against an unseen web edit.
  if (mutation.baseUpdatedAt && current.updatedAt) {
    if (mutation.baseUpdatedAt.getTime() !== current.updatedAt.getTime()) {
      return { version: 0, conflictingFields: mutation.changedFields };
    }
  }

  return null;
}

async function recordAppliedMutation({
  clientEntityId,
  entityId,
  entityType,
  mutation,
  operation,
  record,
  teamId,
  userId,
}: {
  clientEntityId?: string;
  entityId: string;
  entityType: MobileEntityType;
  mutation: MobileMutation;
  operation: MobileMutation["operation"];
  record: Record<string, unknown> | null;
  teamId: string;
  userId: string;
}) {
  const db = getDB();
  const existing = await db.query.syncEntitiesTable.findFirst({
    where: and(
      eq(syncEntitiesTable.teamId, teamId),
      eq(syncEntitiesTable.entityType, entityType),
      eq(syncEntitiesTable.entityId, entityId),
    ),
  });
  const version = (existing?.version ?? 0) + 1;
  const now = new Date();

  await db
    .insert(syncEntitiesTable)
    .values({
      teamId,
      entityType,
      entityId,
      clientId: clientEntityId ?? existing?.clientId,
      version,
      deletedAt: operation === "delete" ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [syncEntitiesTable.teamId, syncEntitiesTable.entityType, syncEntitiesTable.entityId],
      set: {
        clientId: clientEntityId ?? existing?.clientId,
        version,
        deletedAt: operation === "delete" ? now : null,
        updatedAt: now,
      },
    });

  const [change] = await db
    .insert(syncChangesTable)
    .values({
      teamId,
      entityType,
      entityId,
      version,
      operation: operation === "delete" ? "delete" : "upsert",
      changedFields: mutation.changedFields,
      serverUpdatedAt: now,
    })
    .returning({ sequence: syncChangesTable.sequence });

  const result = {
    mutationId: mutation.mutationId,
    entityType,
    operation,
    clientEntityId: clientEntityId ?? null,
    serverEntityId: entityId,
    version,
    sequence: change.sequence,
    record,
  };

  await db.insert(syncMutationsTable).values({
    id: mutation.mutationId,
    teamId,
    userId,
    entityType,
    operation,
    clientEntityId,
    serverEntityId: entityId,
    result,
  });

  return result;
}

async function recordReceiptOnly({
  clientEntityId,
  entity,
  entityType,
  mutation,
  teamId,
  userId,
  version,
}: {
  clientEntityId: string;
  entity: OwnedEntity;
  entityType: MobileEntityType;
  mutation: MobileMutation;
  teamId: string;
  userId: string;
  version: number;
}) {
  const db = getDB();
  const result = {
    mutationId: mutation.mutationId,
    entityType,
    operation: mutation.operation,
    clientEntityId,
    serverEntityId: entity.id,
    version,
    record: entity.record,
    replayed: true,
  };
  await db.insert(syncMutationsTable).values({
    id: mutation.mutationId,
    teamId,
    userId,
    entityType,
    operation: mutation.operation,
    clientEntityId,
    serverEntityId: entity.id,
    result,
  });
  return result;
}

async function applyMobileMutation({
  mutation,
  permissions,
  teamId,
  userId,
}: {
  mutation: MobileMutation;
  permissions: string[];
  teamId: string;
  userId: string;
}) {
  if (!mutation.entityType) throw new MobileAPIError(400, "Missing entity type");
  const db = getDB();
  const existingReceipt = await db.query.syncMutationsTable.findFirst({
    where: eq(syncMutationsTable.id, mutation.mutationId),
  });
  if (existingReceipt) {
    if (existingReceipt.teamId !== teamId) {
      throw new MobileAPIError(409, "That mutation ID was already used by another team");
    }
    return { kind: "acknowledged" as const, result: existingReceipt.result };
  }

  const permission = entityPermissions[mutation.entityType][mutation.operation];
  if (!permissions.includes(permission)) throw new MobileAPIError(403, `Missing permission ${permission}`);

  if (mutation.operation === "create") {
    const clientEntityId = mutation.clientEntityId!;
    const existing = await findByClientId({ clientEntityId, entityType: mutation.entityType, teamId });
    if (existing) {
      const syncEntity = await db.query.syncEntitiesTable.findFirst({
        where: and(
          eq(syncEntitiesTable.teamId, teamId),
          eq(syncEntitiesTable.entityType, mutation.entityType),
          eq(syncEntitiesTable.entityId, existing.id),
        ),
      });
      if (syncEntity) {
        const result = await recordReceiptOnly({
          clientEntityId,
          entity: existing,
          entityType: mutation.entityType,
          mutation,
          teamId,
          userId,
          version: syncEntity.version,
        });
        return { kind: "acknowledged" as const, result };
      }
      const result = await recordAppliedMutation({
        clientEntityId,
        entityId: existing.id,
        entityType: mutation.entityType,
        mutation,
        operation: "create",
        record: existing.record,
        teamId,
        userId,
      });
      return { kind: "acknowledged" as const, result };
    }

    const payload = asRecord(parsePayload(mutation));
    const created = await createEntity({ clientEntityId, entityType: mutation.entityType, payload, teamId });
    if (!created) throw new MobileAPIError(500, "Create did not return a record");
    const createdRecord = asRecord(created);
    const result = await recordAppliedMutation({
      clientEntityId,
      entityId: String(createdRecord.id),
      entityType: mutation.entityType,
      mutation,
      operation: "create",
      record: createdRecord,
      teamId,
      userId,
    });
    return { kind: "acknowledged" as const, result };
  }

  let serverEntityId = mutation.serverEntityId!;
  let current = await findOwnedEntity({ entityId: serverEntityId, entityType: mutation.entityType, teamId });
  // Native stores keep their stable local ID even after receiving a canonical
  // server ID. Resolve that local ID through the sync mapping when necessary.
  if (!current) {
    const mapped = await findByClientId({
      clientEntityId: serverEntityId,
      entityType: mutation.entityType,
      teamId,
    });
    if (mapped) {
      current = mapped;
      serverEntityId = mapped.id;
    }
  }
  if (!current) {
    if (mutation.operation === "delete") {
      const result = await recordAppliedMutation({
        entityId: serverEntityId,
        entityType: mutation.entityType,
        mutation,
        operation: "delete",
        record: null,
        teamId,
        userId,
      });
      return { kind: "acknowledged" as const, result };
    }
    return {
      kind: "conflict" as const,
      result: {
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        serverEntityId,
        reason: "deleted",
        conflictingFields: mutation.changedFields,
        canonical: null,
      },
    };
  }

  const conflict = await findConflict({ current, mutation, teamId });
  if (conflict) {
    return {
      kind: "conflict" as const,
      result: {
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        serverEntityId,
        reason: "overlapping_changes",
        conflictingFields: conflict.conflictingFields,
        serverVersion: conflict.version,
        canonical: current.record,
      },
    };
  }

  if (mutation.operation === "delete") {
    await deleteEntity({ entityId: serverEntityId, entityType: mutation.entityType, teamId });
    const result = await recordAppliedMutation({
      entityId: serverEntityId,
      entityType: mutation.entityType,
      mutation,
      operation: "delete",
      record: null,
      teamId,
      userId,
    });
    return { kind: "acknowledged" as const, result };
  }

  const payload = asRecord(parsePayload(mutation));
  const updated = await updateEntity({ entityId: serverEntityId, entityType: mutation.entityType, payload, teamId });
  if (!updated) throw new MobileAPIError(404, "Entity was not found");
  const updatedRecord = asRecord(updated);
  const result = await recordAppliedMutation({
    clientEntityId: typeof updatedRecord.clientId === "string" ? updatedRecord.clientId : undefined,
    entityId: serverEntityId,
    entityType: mutation.entityType,
    mutation,
    operation: "update",
    record: updatedRecord,
    teamId,
    userId,
  });
  return { kind: "acknowledged" as const, result };
}

export async function applyMobileMutations({
  mutations,
  permissions,
  teamId,
  userId,
}: ApplyMobileMutationsParams) {
  const acknowledged: Array<Record<string, unknown>> = [];
  const conflicts: Array<Record<string, unknown>> = [];

  const dependencyOrder: MobileEntityType[] = [
    "recipeBook",
    "groceryTemplate",
    "recipe",
    "week",
    "recipeRelation",
    "weekRecipe",
    "groceryItem",
  ];
  const ordered = [...mutations].sort(
    (left, right) => dependencyOrder.indexOf(left.entityType!) - dependencyOrder.indexOf(right.entityType!),
  );

  for (const mutation of ordered) {
    const outcome = await applyMobileMutation({ mutation, permissions, teamId, userId });
    if (outcome.kind === "acknowledged") acknowledged.push(outcome.result);
    else conflicts.push(outcome.result);
  }

  return { acknowledged, conflicts };
}

export async function getMobileChanges({
  cursor,
  limit,
  permissions,
  teamId,
}: {
  cursor: number;
  limit: number;
  permissions: string[];
  teamId: string;
}) {
  const db = getDB();
  const changes = await db.query.syncChangesTable.findMany({
    where: and(eq(syncChangesTable.teamId, teamId), gt(syncChangesTable.sequence, cursor)),
    orderBy: (table, { asc }) => [asc(table.sequence)],
    limit: limit + 1,
  });
  const hasMore = changes.length > limit;
  const page = hasMore ? changes.slice(0, limit) : changes;
  const allowedTypes = new Set<MobileEntityType>();
  if (permissions.includes(TEAM_PERMISSIONS.ACCESS_RECIPES)) {
    allowedTypes.add("recipe");
    allowedTypes.add("recipeBook");
    allowedTypes.add("recipeRelation");
  }
  if (permissions.includes(TEAM_PERMISSIONS.ACCESS_SCHEDULES)) {
    allowedTypes.add("week");
    allowedTypes.add("weekRecipe");
    allowedTypes.add("groceryItem");
  }
  if (permissions.includes(TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES)) {
    allowedTypes.add("groceryTemplate");
  }

  const visibleChanges = page.filter((change) => allowedTypes.has(change.entityType as MobileEntityType));
  const hydratedChanges = await Promise.all(
    visibleChanges.map(async (change) => {
      const entityType = change.entityType as MobileEntityType;
      const [entity, syncEntity] = await Promise.all([
        change.operation === "delete"
          ? Promise.resolve(null)
          : findOwnedEntity({ entityId: change.entityId, entityType, teamId }),
        db.query.syncEntitiesTable.findFirst({
          where: and(
            eq(syncEntitiesTable.teamId, teamId),
            eq(syncEntitiesTable.entityType, entityType),
            eq(syncEntitiesTable.entityId, change.entityId),
          ),
        }),
      ]);
      return {
        ...change,
        clientId: syncEntity?.clientId ?? null,
        record: entity?.record ?? null,
      };
    }),
  );

  return {
    changes: hydratedChanges,
    cursor: String(page.at(-1)?.sequence ?? cursor),
    hasMore,
  };
}

export function getRecordUpdatedAt(record: Record<string, unknown>) {
  return getUpdatedAt(record);
}
