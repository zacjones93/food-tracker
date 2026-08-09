import { sqliteTable, integer, text, index, primaryKey, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { type InferSelectModel } from "drizzle-orm";

import { createId } from '@paralleldrive/cuid2'

export const ROLES_ENUM = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

const roleTuple = Object.values(ROLES_ENUM) as [string, ...string[]];

// System roles for team members
export const SYSTEM_ROLES_ENUM = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  GUEST: 'guest',
} as const;

export const systemRoleTuple = Object.values(SYSTEM_ROLES_ENUM) as [string, ...string[]];

// Team permissions
export const TEAM_PERMISSIONS = {
  // Recipe permissions
  ACCESS_RECIPES: 'access_recipes',
  CREATE_RECIPES: 'create_recipes',
  EDIT_RECIPES: 'edit_recipes',
  DELETE_RECIPES: 'delete_recipes',

  // Food Schedule permissions
  ACCESS_SCHEDULES: 'access_schedules',
  CREATE_SCHEDULES: 'create_schedules',
  EDIT_SCHEDULES: 'edit_schedules',
  DELETE_SCHEDULES: 'delete_schedules',

  // Grocery Template permissions
  ACCESS_GROCERY_TEMPLATES: 'access_grocery_templates',
  CREATE_GROCERY_TEMPLATES: 'create_grocery_templates',
  EDIT_GROCERY_TEMPLATES: 'edit_grocery_templates',
  DELETE_GROCERY_TEMPLATES: 'delete_grocery_templates',

  // Team management
  INVITE_MEMBERS: 'invite_members',
  REMOVE_MEMBERS: 'remove_members',
  CHANGE_MEMBER_ROLES: 'change_member_roles',
  EDIT_TEAM_SETTINGS: 'edit_team_settings',
  DELETE_TEAM: 'delete_team',

  // Role management (custom roles)
  CREATE_ROLES: 'create_roles',
  EDIT_ROLES: 'edit_roles',
  DELETE_ROLES: 'delete_roles',
  ASSIGN_ROLES: 'assign_roles',

  // AI permissions
  USE_AI_ASSISTANT: 'ai:use_assistant',
  VIEW_AI_USAGE: 'ai:view_usage',
  MANAGE_AI_SETTINGS: 'ai:manage_settings',
} as const;

// Recipe visibility options
export const RECIPE_VISIBILITY = {
  PUBLIC: 'public',      // Everyone can see, shows in search
  PRIVATE: 'private',    // Only owning team can see
  UNLISTED: 'unlisted',  // Everyone can see, hidden from search
} as const;

export const RECIPE_TYPES = {
  STANDARD: 'standard',
  COFFEE_DRINK: 'coffee_drink',
} as const;

const recipeTypeTuple: [typeof RECIPE_TYPES.STANDARD, typeof RECIPE_TYPES.COFFEE_DRINK] = [
  RECIPE_TYPES.STANDARD,
  RECIPE_TYPES.COFFEE_DRINK,
];

const commonColumns = {
  createdAt: integer({
    mode: "timestamp",
  }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({
    mode: "timestamp",
  }).$onUpdateFn(() => new Date()).notNull(),
  updateCounter: integer().default(0).$onUpdate(() => sql`updateCounter + 1`),
}

export const userTable = sqliteTable("user", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `usr_${createId()}`).notNull(),
  firstName: text({
    length: 255,
  }),
  lastName: text({
    length: 255,
  }),
  email: text({
    length: 255,
  }).unique().notNull(),
  passwordHash: text().notNull(),
  role: text({
    enum: roleTuple,
  }).default(ROLES_ENUM.USER).notNull(),
  /**
   * This can either be an absolute or relative path to an image
   */
  avatar: text({
    length: 600,
  }),
  /**
   * The default team to load when the user signs in
   */
  defaultTeamId: text().references(() => teamTable.id, { onDelete: 'set null' }),
}, (table) => ([
  index('email_idx').on(table.email),
  index('role_idx').on(table.role),
]));

// Teams table
export const teamTable = sqliteTable("team", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `team_${createId()}`).notNull(),
  name: text({ length: 255 }).notNull(),
  slug: text({ length: 255 }).notNull().unique(),
  description: text({ length: 1000 }),
  avatarUrl: text({ length: 600 }),
});

// Team memberships table
export const teamMembershipTable = sqliteTable("team_membership", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tmem_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  roleId: text().notNull(),
  isSystemRole: integer().default(1).notNull(),
  invitedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
  joinedAt: integer({ mode: "timestamp" }),
  isActive: integer().default(1).notNull(),
}, (table) => ([
  index("tm_team_idx").on(table.teamId),
  index("tm_user_idx").on(table.userId),
  uniqueIndex("tm_team_user_unique").on(table.teamId, table.userId),
]));

// Team roles table
export const teamRoleTable = sqliteTable("team_role", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `trole_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  name: text({ length: 255 }).notNull(),
  description: text({ length: 1000 }),
  permissions: text({ mode: 'json' }).$type<string[]>().notNull(),
  metadata: text({ length: 5000 }),
  isEditable: integer().default(1).notNull(),
}, (table) => ([
  index("tr_team_idx").on(table.teamId),
]));

// Team invitations table
export const teamInvitationTable = sqliteTable("team_invitation", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tinv_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  email: text({ length: 255 }).notNull(),
  roleId: text().notNull(),
  isSystemRole: integer().default(1).notNull(),
  token: text({ length: 255 }).notNull().unique(),
  invitedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
  acceptedAt: integer({ mode: "timestamp" }),
  acceptedBy: text().references(() => userTable.id, { onDelete: 'set null' }),
}, (table) => ([
  index("ti_team_idx").on(table.teamId),
  index("ti_token_idx").on(table.token),
]));

// Team settings table
export const teamSettingsTable = sqliteTable("team_settings", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tset_${createId()}`).notNull(),
  teamId: text().notNull().unique().references(() => teamTable.id, { onDelete: 'cascade' }),

  // Recipe settings
  recipeVisibilityMode: text({ length: 20 }).notNull().default('all'),
  // Values: 'all', 'team_only'

  defaultRecipeVisibility: text({ length: 20 }).notNull().default('public'),
  // Values: 'public', 'private', 'unlisted'
  // Controls the default visibility when creating new recipes

  // Schedule settings
  autoAddIngredientsToGrocery: integer({ mode: 'boolean' }).notNull().default(true),
  // Controls whether recipe ingredients are automatically added to grocery list
  // when a recipe is added to a schedule

  // AI Features
  aiEnabled: integer({ mode: 'boolean' }).notNull().default(false),
  aiMonthlyBudgetUsd: text().default('10.0'), // Stored as text for precise decimal handling
  aiMaxTokensPerRequest: integer().default(4000),
  aiMaxRequestsPerDay: integer().default(100),
}, (table) => ([
  index("tset_team_idx").on(table.teamId),
]));

export interface TeamEntitlementFeatures {
  weekCreationLimit: number | null;
  aiAssistant: boolean;
  pushNotifications: boolean;
}

// Immutable feature snapshots are created when a team purchases a subscription.
// Existing subscribers keep this exact feature set when the current plan changes.
export const teamEntitlementSnapshotsTable = sqliteTable("team_entitlement_snapshot", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tent_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  source: text({ length: 50 }).notNull(),
  sourceId: text({ length: 255 }).notNull(),
  planKey: text({ length: 100 }).notNull(),
  planVersion: integer().notNull(),
  features: text({ mode: 'json' }).$type<TeamEntitlementFeatures>().notNull(),
  grantedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("tent_team_idx").on(table.teamId),
  uniqueIndex("tent_source_unique").on(table.source, table.sourceId),
]));

export const teamSubscriptionsTable = sqliteTable("team_subscription", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tsub_${createId()}`).notNull(),
  teamId: text().notNull().unique().references(() => teamTable.id, { onDelete: 'cascade' }),
  stripeCustomerId: text({ length: 255 }).notNull(),
  stripeSubscriptionId: text({ length: 255 }),
  entitlementSnapshotId: text().references(() => teamEntitlementSnapshotsTable.id, { onDelete: 'set null' }),
  status: text({ length: 50 }).notNull().default('none'),
  priceId: text({ length: 255 }),
  currentPeriodStart: integer({ mode: 'timestamp' }),
  currentPeriodEnd: integer({ mode: 'timestamp' }),
  cancelAtPeriodEnd: integer({ mode: 'boolean' }).notNull().default(false),
  paymentMethod: text({ mode: 'json' }).$type<{ brand: string | null; last4: string | null } | null>(),
  lastSyncedAt: integer({ mode: 'timestamp' }),
}, (table) => ([
  uniqueIndex("tsub_customer_unique").on(table.stripeCustomerId),
  uniqueIndex("tsub_subscription_unique").on(table.stripeSubscriptionId),
]));

// StoreKit purchases remain bound to the team selected when checkout begins.
// appAccountToken is the opaque UUID shared with Apple; it is not a user ID.
export const appleSubscriptionBindingsTable = sqliteTable("apple_subscription_binding", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `asub_${createId()}`).notNull(),
  teamId: text().notNull().unique().references(() => teamTable.id, { onDelete: 'cascade' }),
  appAccountToken: text({ length: 36 }).notNull().unique(),
  originalTransactionId: text({ length: 255 }),
  entitlementSnapshotId: text().references(() => teamEntitlementSnapshotsTable.id, { onDelete: 'set null' }),
  environment: text({ length: 20 }),
  bundleId: text({ length: 255 }),
  productId: text({ length: 255 }),
  status: text({ length: 50 }).notNull().default('none'),
  autoRenewStatus: integer({ mode: 'boolean' }).notNull().default(false),
  purchaseDate: integer({ mode: 'timestamp' }),
  currentPeriodEnd: integer({ mode: 'timestamp' }),
  gracePeriodExpiresAt: integer({ mode: 'timestamp' }),
  revocationDate: integer({ mode: 'timestamp' }),
  lastTransactionId: text({ length: 255 }),
  lastTransactionSignedAt: integer({ mode: 'timestamp' }),
  lastRenewalSignedAt: integer({ mode: 'timestamp' }),
  lastSyncedAt: integer({ mode: 'timestamp' }),
}, (table) => ([
  uniqueIndex("asub_original_transaction_unique").on(table.originalTransactionId),
]));

// Notification UUIDs form the idempotency ledger for App Store Server
// Notifications V2. Subscription writes are themselves monotonic by signedAt.
export const appleServerNotificationEventsTable = sqliteTable("apple_server_notification_event", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `asne_${createId()}`).notNull(),
  notificationUuid: text({ length: 36 }).notNull().unique(),
  notificationType: text({ length: 100 }),
  subtype: text({ length: 100 }),
  signedAt: integer({ mode: 'timestamp' }),
  originalTransactionId: text({ length: 255 }),
  status: text({ length: 20 }).notNull().default('pending'),
  attempts: integer().notNull().default(1),
  error: text({ length: 1000 }),
  processedAt: integer({ mode: 'timestamp' }),
}, (table) => ([
  index("asne_status_idx").on(table.status),
]));

// Lifetime counters remain separate from snapshots so deleting a week cannot
// reset a free team's four-creation allowance.
export const teamFeatureUsageTable = sqliteTable("team_feature_usage", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tfu_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  feature: text({ length: 100 }).notNull(),
  usageCount: integer().notNull().default(0),
}, (table) => ([
  uniqueIndex("tfu_team_feature_unique").on(table.teamId, table.feature),
]));

// Recipe books table
export const recipeBooksTable = sqliteTable("recipe_books", {
  id: text().primaryKey().$defaultFn(() => `rb_${createId()}`).notNull(),
  clientId: text({ length: 255 }),
  teamId: text().references(() => teamTable.id, { onDelete: 'cascade' }),
  name: text({ length: 500 }).notNull().unique(),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).default(sql`0`).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
}, (table) => ([
  index("recipe_books_name_idx").on(table.name),
  uniqueIndex("recipe_books_client_id_idx").on(table.clientId),
  uniqueIndex("recipe_books_team_name_idx").on(table.teamId, table.name),
]));

// Recipes table
export const recipesTable = sqliteTable("recipes", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `rcp_${createId()}`).notNull(),

  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  clientId: text({ length: 255 }),

  // Core fields
  name: text({ length: 500 }).notNull(),
  emoji: text({ length: 10 }),  // Recipe icon

  // Metadata
  tags: text({ mode: 'json' }).$type<string[]>(),  // JSON array of tags
  mealType: text({ length: 50 }),  // "Lunch", "Dinner", "Breakfast"
  difficulty: text({ length: 20 }),  // "Easy", "Medium", "Hard"
  visibility: text({ length: 20 }).notNull().default('public'),  // "public", "private", "unlisted"
  recipeType: text({ enum: recipeTypeTuple }).notNull().default(RECIPE_TYPES.STANDARD),

  // Public integration identifiers are intentionally distinct from database IDs.
  // They remain stable across withdraw/re-publish cycles in Dial Your Espresso.
  dialExternalId: text({ length: 255 }),
  dialRevision: integer().notNull().default(0),

  // Source tracking
  sourceRecipeId: text().references(
    (): AnySQLiteColumn => recipesTable.id,
    { onDelete: 'set null' },
  ),
  recipeLink: text({ length: 1000 }),  // URL to original recipe
  recipeBookId: text().references(() => recipeBooksTable.id, { onDelete: 'set null' }),
  page: text({ length: 50 }),  // Page number in recipe book

  // Tracking
  lastMadeDate: integer({ mode: 'timestamp' }),
  mealsEatenCount: integer().default(0).notNull(),

  // Content
  ingredients: text({ mode: 'json' }).$type<Array<{ title?: string; items: string[] }>>(),  // JSON array of ingredient sections
  recipeBody: text(),  // Full recipe instructions (markdown)
}, (table) => ([
  index("recipes_name_idx").on(table.name),
  index("recipes_book_idx").on(table.recipeBookId),
  index("recipes_team_idx").on(table.teamId),
  index("recipes_visibility_idx").on(table.visibility),
  index("recipes_type_visibility_idx").on(table.recipeType, table.visibility),
  uniqueIndex("recipes_dial_external_id_idx").on(table.dialExternalId),
  uniqueIndex("recipes_team_client_id_idx").on(table.teamId, table.clientId),
]));

// Dial requests an opaque intent through a service binding, then a signed-in
// Listo user explicitly approves it on the web. Email is display/discovery data
// only and is never consulted when authorizing or consuming an intent.
export const dialConnectionIntentsTable = sqliteTable("dial_connection_intents", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `dint_${createId()}`).notNull(),
  tokenHash: text({ length: 64 }).notNull().unique(),
  requestedScopes: text({ mode: 'json' }).$type<Array<'account' | 'team'>>().notNull(),
  dialUserRef: text({ length: 255 }),
  dialUserLabel: text({ length: 255 }),
  dialTeamRef: text({ length: 255 }),
  dialTeamLabel: text({ length: 255 }),
  emailHint: text({ length: 255 }),
  returnUrl: text({ length: 1000 }).notNull(),
  status: text({ length: 20 }).notNull().default('pending'),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  approvedByUserId: text().references(() => userTable.id, { onDelete: 'set null' }),
  approvedTeamId: text().references(() => teamTable.id, { onDelete: 'set null' }),
  approvedAt: integer({ mode: 'timestamp' }),
  consumedAt: integer({ mode: 'timestamp' }),
  result: text({ mode: 'json' }).$type<{
    accountLinkId?: string;
    teamPairingId?: string;
  }>(),
}, (table) => ([
  index("dial_intents_status_expiry_idx").on(table.status, table.expiresAt),
]));

export const dialTeamPairingsTable = sqliteTable("dial_team_pairings", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `dtp_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  dialTeamRef: text({ length: 255 }).notNull(),
  dialTeamLabel: text({ length: 255 }),
  connectedByUserId: text().references(() => userTable.id, { onDelete: 'set null' }),
  isActive: integer({ mode: 'boolean' }).notNull().default(true),
  disconnectedAt: integer({ mode: 'timestamp' }),
}, (table) => ([
  uniqueIndex("dial_pairings_listo_team_unique").on(table.teamId),
  uniqueIndex("dial_pairings_dial_team_unique").on(table.dialTeamRef),
]));

export const dialAccountLinksTable = sqliteTable("dial_account_links", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `dal_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  dialUserRef: text({ length: 255 }).notNull(),
  dialUserLabel: text({ length: 255 }),
  isActive: integer({ mode: 'boolean' }).notNull().default(true),
  disconnectedAt: integer({ mode: 'timestamp' }),
}, (table) => ([
  uniqueIndex("dial_links_listo_user_unique").on(table.userId),
  uniqueIndex("dial_links_dial_user_unique").on(table.dialUserRef),
]));

// Durable outbox for the Queue producer. The event key is stable and unique,
// so at-least-once Queue delivery is idempotent at both ends.
export const dialRecipeEventsTable = sqliteTable("dial_recipe_events", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `dre_${createId()}`).notNull(),
  eventKey: text({ length: 500 }).notNull().unique(),
  recipeId: text().references(() => recipesTable.id, { onDelete: 'set null' }),
  recipeExternalId: text({ length: 255 }).notNull(),
  revision: integer().notNull(),
  eventType: text({ length: 30 }).notNull(),
  payload: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text({ length: 20 }).notNull().default('pending'),
  queuedAt: integer({ mode: 'timestamp' }),
  deliveredAt: integer({ mode: 'timestamp' }),
  lastError: text({ length: 1000 }),
}, (table) => ([
  index("dial_events_status_created_idx").on(table.status, table.createdAt),
  index("dial_events_recipe_revision_idx").on(table.recipeExternalId, table.revision),
]));

// Weeks table
export const weeksTable = sqliteTable("weeks", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `wk_${createId()}`).notNull(),

  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  clientId: text({ length: 255 }),

  name: text({ length: 255 }).notNull(),  // "Oct 14th - 19th, 2025"
  emoji: text({ length: 10 }),

  status: text({ length: 50 }).notNull().default('upcoming'),
  // Values: "current", "upcoming", "archived"

  startDate: integer({ mode: 'timestamp' }),
  endDate: integer({ mode: 'timestamp' }),

  weekNumber: integer(),  // Numeric identifier if needed

  // Grocery list stored as page content (markdown checklist)
}, (table) => ([
  index("weeks_team_idx").on(table.teamId),
  index("weeks_status_idx").on(table.status),
  index("weeks_start_date_idx").on(table.startDate),
  uniqueIndex("weeks_team_client_id_idx").on(table.teamId, table.clientId),
]));

// Self-referencing: Recipe ↔ Recipe (sides/accompaniments)
export const recipeRelationsTable = sqliteTable("recipe_relations", {
  id: text().primaryKey().$defaultFn(() => `rr_${createId()}`).notNull(),
  clientId: text({ length: 255 }),
  mainRecipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),
  sideRecipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),
  relationType: text({ length: 50 }).notNull().default('side'),
  order: integer().default(0).notNull(),
  scheduleLeadDays: integer(),

  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).default(sql`0`).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
}, (table) => ([
  index("rr_main_idx").on(table.mainRecipeId),
  index("rr_side_idx").on(table.sideRecipeId),
  uniqueIndex("rr_client_id_idx").on(table.clientId),
]));

// Many-to-many: Weeks ↔ Recipes
export const weekRecipesTable = sqliteTable("week_recipes", {
  id: text().primaryKey().$defaultFn(() => `wr_${createId()}`).notNull(),
  clientId: text({ length: 255 }),
  weekId: text().notNull().references(() => weeksTable.id, { onDelete: 'cascade' }),
  recipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),
  scheduledForWeekRecipeId: text().references(
    (): AnySQLiteColumn => weekRecipesTable.id,
    { onDelete: 'set null' },
  ),
  sourceRecipeRelationId: text().references(() => recipeRelationsTable.id, { onDelete: 'set null' }),

  scheduledDate: integer({ mode: 'timestamp' }),  // Specific date this recipe is scheduled for
  order: integer().default(0),  // Display order within the day
  made: integer({ mode: 'boolean' }).default(false).notNull(),  // Whether recipe has been made/eaten
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).default(sql`0`).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
}, (table) => ([
  index("wr_week_idx").on(table.weekId),
  index("wr_recipe_idx").on(table.recipeId),
  index("wr_unique_idx").on(table.weekId, table.recipeId),
  index("wr_scheduled_date_idx").on(table.scheduledDate),
  index("wr_scheduled_for_idx").on(table.scheduledForWeekRecipeId),
  index("wr_source_relation_idx").on(table.sourceRecipeRelationId),
  uniqueIndex("wr_client_id_idx").on(table.clientId),
]));

// Grocery items for weeks
export const groceryItemsTable = sqliteTable("grocery_items", {
  id: text().primaryKey().$defaultFn(() => `gi_${createId()}`).notNull(),
  clientId: text({ length: 255 }),
  weekId: text().notNull().references(() => weeksTable.id, { onDelete: 'cascade' }),

  name: text({ length: 500 }).notNull(),
  checked: integer({ mode: 'boolean' }).default(false).notNull(),
  order: integer().default(0),
  category: text({ length: 100 }),  // Optional: "Produce", "Meat", "Dairy", etc.

  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).$onUpdateFn(() => new Date()).notNull(),
}, (table) => ([
  index("gi_week_idx").on(table.weekId),
  index("gi_order_idx").on(table.weekId, table.order),
  uniqueIndex("gi_client_id_idx").on(table.clientId),
]));

// Grocery list templates
export const groceryListTemplatesTable = sqliteTable("grocery_list_templates", {
  id: text().primaryKey().$defaultFn(() => `glt_${createId()}`).notNull(),
  clientId: text({ length: 255 }),
  name: text({ length: 255 }).notNull(),

  // Template structure stored as JSON:
  // [{ category: "Meat", order: 0, items: [{ name: "eggs", order: 0 }, ...] }, ...]
  template: text({ mode: 'json' }).$type<Array<{
    category: string;
    order: number;
    items: Array<{ name: string; order: number }>;
  }>>().notNull(),

  teamId: text().references(() => teamTable.id, { onDelete: 'cascade' }),
  isDefault: integer({ mode: 'boolean' }).default(false).notNull(),

  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).$onUpdateFn(() => new Date()).notNull(),
}, (table) => ([
  index("glt_name_idx").on(table.name),
  index("glt_team_idx").on(table.teamId),
  index("glt_default_idx").on(table.isDefault),
  uniqueIndex("glt_client_id_idx").on(table.clientId),
]));

export const syncEntitiesTable = sqliteTable("sync_entities", {
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  entityType: text({ length: 50 }).notNull(),
  entityId: text({ length: 255 }).notNull(),
  clientId: text({ length: 255 }),
  version: integer().notNull().default(1),
  deletedAt: integer({ mode: 'timestamp' }),
  updatedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
}, (table) => ([
  primaryKey({ columns: [table.teamId, table.entityType, table.entityId] }),
  uniqueIndex("sync_entities_client_idx").on(table.teamId, table.entityType, table.clientId),
  index("sync_entities_updated_idx").on(table.teamId, table.updatedAt),
]));

export const syncChangesTable = sqliteTable("sync_changes", {
  sequence: integer().primaryKey({ autoIncrement: true }),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  entityType: text({ length: 50 }).notNull(),
  entityId: text({ length: 255 }).notNull(),
  version: integer().notNull(),
  operation: text({ length: 20 }).notNull(),
  changedFields: text({ mode: 'json' }).$type<string[]>().notNull(),
  serverUpdatedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("sync_changes_team_sequence_idx").on(table.teamId, table.sequence),
  index("sync_changes_entity_version_idx").on(table.teamId, table.entityType, table.entityId, table.version),
]));

// Idempotency ledger for offline clients. Domain IDs remain server-generated;
// clientEntityId is mapped to serverEntityId after an offline create succeeds.
export const syncMutationsTable = sqliteTable("sync_mutations", {
  id: text().primaryKey().notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  entityType: text({ length: 50 }).notNull(),
  operation: text({ length: 20 }).notNull(),
  clientEntityId: text({ length: 255 }),
  serverEntityId: text({ length: 255 }),
  result: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  appliedAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("sync_mutations_team_idx").on(table.teamId, table.appliedAt),
  index("sync_mutations_client_entity_idx").on(table.teamId, table.entityType, table.clientEntityId),
]));

// APNs device tokens are user-scoped delivery addresses. Team membership and
// notification preferences are rechecked separately at delivery time.
export const notificationPushDevicesTable = sqliteTable("notification_push_devices", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `push_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  platform: text({ length: 20 }).notNull().default('ios'),
  installationId: text({ length: 64 }).notNull(),
  token: text({ length: 1024 }).notNull(),
  environment: text({ length: 20 }).notNull(),
  bundleId: text({ length: 255 }).notNull(),
  enabled: integer({ mode: 'boolean' }).notNull().default(true),
  lastSeenAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  disabledAt: integer({ mode: 'timestamp' }),
}, (table) => ([
  index("push_devices_user_enabled_idx").on(table.userId, table.enabled),
  uniqueIndex("push_devices_installation_unique").on(table.bundleId, table.environment, table.installationId),
  uniqueIndex("push_devices_token_unique").on(table.bundleId, table.environment, table.token),
]));

// Push is opt-in per user and team. Delivery workers re-read this row and the
// current team membership immediately before every provider call.
export const notificationPushPreferencesTable = sqliteTable("notification_push_preferences", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `pushpref_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  topic: text({ length: 100 }).notNull(),
  pushEnabled: integer({ mode: 'boolean' }).notNull().default(false),
}, (table) => ([
  uniqueIndex("push_preferences_team_user_topic_unique").on(table.teamId, table.userId, table.topic),
]));

// One row represents one logical notification for one device. Producers use
// the dedupe key constraint as the outbox/idempotency boundary; the Worker uses
// status + leaseExpiresAt as a compare-and-set delivery state machine.
export const notificationPushDeliveriesTable = sqliteTable("notification_push_deliveries", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `pushdel_${createId()}`).notNull(),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  pushDeviceId: text().notNull().references(() => notificationPushDevicesTable.id, { onDelete: 'cascade' }),
  topic: text({ length: 100 }).notNull(),
  dedupeKey: text({ length: 255 }).notNull(),
  title: text({ length: 255 }).notNull(),
  body: text({ length: 2048 }).notNull(),
  destination: text({ length: 1000 }),
  status: text({ length: 30 }).notNull().default('pending'),
  apnsId: text({ length: 36 }).notNull(),
  attemptCount: integer().notNull().default(0),
  leaseExpiresAt: integer({ mode: 'timestamp' }),
  lastAttemptAt: integer({ mode: 'timestamp' }),
  acceptedAt: integer({ mode: 'timestamp' }),
  failedAt: integer({ mode: 'timestamp' }),
  suppressedAt: integer({ mode: 'timestamp' }),
  providerMessageId: text({ length: 255 }),
  providerCode: text({ length: 100 }),
  lastError: text({ length: 1000 }),
}, (table) => ([
  index("push_deliveries_status_lease_idx").on(table.status, table.leaseExpiresAt),
  index("push_deliveries_team_user_idx").on(table.teamId, table.userId),
  uniqueIndex("push_deliveries_device_dedupe_unique").on(table.pushDeviceId, table.dedupeKey),
]));

// AI Usage tracking table
export const aiUsageTable = sqliteTable("ai_usage", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `aiu_${createId()}`).notNull(),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  model: text({ length: 100 }).notNull(), // e.g., "gemini-2.5-flash"
  endpoint: text({ length: 255 }).notNull(), // e.g., "/api/chat"
  inputTokens: integer().notNull(),
  outputTokens: integer().notNull(),
  reasoningTokens: integer().default(0).notNull(),
  cachedInputTokens: integer().default(0).notNull(),
  totalTokens: integer().notNull(),
  estimatedCostUsd: text().notNull(), // Stored as text for precise decimal handling
  conversationId: text({ length: 255 }), // Optional: track multi-turn conversations
  finishReason: text({ length: 50 }), // e.g., "stop", "length", "tool_calls"
}, (table) => ([
  index("ai_usage_user_idx").on(table.userId),
  index("ai_usage_team_idx").on(table.teamId),
  index("ai_usage_created_idx").on(table.createdAt),
]));

// Protocol-neutral AI chat persistence tables.
export const aiChatsTable = sqliteTable("ai_chats", {
  ...commonColumns,
  id: text().primaryKey().notNull(), // Client-provided ID (no auto-generate)
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  title: text({ length: 255 }), // Optional chat title
}, (table) => ([
  index("ai_chats_team_idx").on(table.teamId),
  index("ai_chats_user_idx").on(table.userId),
  index("ai_chats_created_idx").on(table.createdAt),
]));

export const aiMessagesTable = sqliteTable("ai_messages", {
  ...commonColumns,
  id: text().primaryKey(), // Client/server generated IDs (no auto-generate)
  chatId: text().notNull().references(() => aiChatsTable.id, { onDelete: 'cascade' }),
  role: text({ length: 20 }).notNull(), // 'user' | 'assistant' | 'system' | 'tool'
}, (table) => ([
  index("ai_messages_chat_idx").on(table.chatId),
  index("ai_messages_created_idx").on(table.createdAt),
]));

// Prefix-based parts table for type-safe message content storage
export const aiMessagePartsTable = sqliteTable("ai_message_parts", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `aimp_${createId()}`).notNull(),
  messageId: text().notNull().references(() => aiMessagesTable.id, { onDelete: 'cascade' }),
  partOrder: integer().notNull(), // Maintain sequence of parts
  partType: text({ length: 100 }),
  payloadJson: text(),

  // Text content parts
  text_content: text(),

  // Tool call parts (dynamic columns per tool)
  // Format: tool_{toolName}_input, tool_{toolName}_output, tool_{toolName}_state
  // Example: tool_searchRecipes_input, tool_searchRecipes_output, tool_searchRecipes_state
  // These will be stored as TEXT (JSON serialized) due to SQLite limitations
  tool_name: text({ length: 100 }), // Tool name for tool-call parts
  tool_call_id: text({ length: 100 }), // Tool call ID
  tool_args: text(), // JSON-serialized tool arguments
  tool_result: text(), // JSON-serialized tool result
  tool_state: text({ length: 50 }), // 'input-streaming' | 'input-available' | 'output-available' | 'output-error'

  // Image parts
  image_url: text(),
  image_mime_type: text({ length: 50 }),

  // File attachment parts
  file_url: text(),
  file_name: text({ length: 255 }),
  file_type: text({ length: 100 }),
  file_metadata: text(), // JSON-serialized metadata
}, (table) => ([
  index("ai_message_parts_message_idx").on(table.messageId),
  index("ai_message_parts_order_idx").on(table.messageId, table.partOrder),
]));

export type MyDBUIMessagePart = typeof aiMessagePartsTable.$inferInsert;
export type MyDBUIMessagePartSelect = typeof aiMessagePartsTable.$inferSelect;

// Relations
export const recipeBooksRelations = relations(recipeBooksTable, ({ many, one }) => ({
  recipes: many(recipesTable),
  team: one(teamTable, {
    fields: [recipeBooksTable.teamId],
    references: [teamTable.id],
  }),
}));

export const aiRunsTable = sqliteTable("ai_runs", {
  ...commonColumns,
  id: text().primaryKey().notNull(),
  chatId: text().notNull().references(() => aiChatsTable.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  model: text({ length: 150 }).notNull(),
  promptVersion: text({ length: 100 }).notNull(),
  status: text({ length: 30 }).notNull(),
  finishReason: text({ length: 50 }),
  errorCode: text({ length: 100 }),
  usageJson: text(),
}, (table) => ([
  index("ai_runs_chat_idx").on(table.chatId, table.createdAt),
  index("ai_runs_team_idx").on(table.teamId, table.createdAt),
]));

export const aiToolExecutionsTable = sqliteTable("ai_tool_executions", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `aitx_${createId()}`).notNull(),
  runId: text().notNull().references(() => aiRunsTable.id, { onDelete: 'cascade' }),
  namespace: text({ length: 100 }).notNull(),
  toolName: text({ length: 150 }).notNull(),
  status: text({ length: 30 }).notNull(),
  inputSummaryJson: text(),
  outputSummaryJson: text(),
  durationMs: integer().notNull(),
  approvalState: text({ length: 30 }).notNull().default('not-required'),
  writeOccurred: integer({ mode: 'boolean' }).notNull().default(false),
}, (table) => ([
  index("ai_tool_executions_run_idx").on(table.runId),
  index("ai_tool_executions_tool_idx").on(table.namespace, table.toolName),
]));

// Team relations
export const teamRelations = relations(teamTable, ({ many, one }) => ({
  memberships: many(teamMembershipTable),
  invitations: many(teamInvitationTable),
  roles: many(teamRoleTable),
  weeks: many(weeksTable),
  recipes: many(recipesTable),
  recipeBooks: many(recipeBooksTable),
  groceryTemplates: many(groceryListTemplatesTable),
  aiUsage: many(aiUsageTable),
  aiChats: many(aiChatsTable),
  settings: one(teamSettingsTable),
}));

export const teamRoleRelations = relations(teamRoleTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamRoleTable.teamId],
    references: [teamTable.id],
  }),
}));

export const teamMembershipRelations = relations(teamMembershipTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamMembershipTable.teamId],
    references: [teamTable.id],
  }),
  user: one(userTable, {
    fields: [teamMembershipTable.userId],
    references: [userTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [teamMembershipTable.invitedBy],
    references: [userTable.id],
  }),
}));

export const teamInvitationRelations = relations(teamInvitationTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamInvitationTable.teamId],
    references: [teamTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [teamInvitationTable.invitedBy],
    references: [userTable.id],
  }),
  acceptedByUser: one(userTable, {
    fields: [teamInvitationTable.acceptedBy],
    references: [userTable.id],
  }),
}));

export const teamSettingsRelations = relations(teamSettingsTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamSettingsTable.teamId],
    references: [teamTable.id],
  }),
}));

export const recipesRelations = relations(recipesTable, ({ many, one }) => ({
  weeks: many(weekRecipesTable),
  sideRecipes: many(recipeRelationsTable, { relationName: "mainRecipe" }),
  mainRecipes: many(recipeRelationsTable, { relationName: "sideRecipe" }),
  recipeBook: one(recipeBooksTable, {
    fields: [recipesTable.recipeBookId],
    references: [recipeBooksTable.id],
  }),
  team: one(teamTable, {
    fields: [recipesTable.teamId],
    references: [teamTable.id],
  }),
}));

export const weeksRelations = relations(weeksTable, ({ many, one }) => ({
  recipes: many(weekRecipesTable),
  groceryItems: many(groceryItemsTable),
  team: one(teamTable, {
    fields: [weeksTable.teamId],
    references: [teamTable.id],
  }),
}));

export const groceryItemsRelations = relations(groceryItemsTable, ({ one }) => ({
  week: one(weeksTable, {
    fields: [groceryItemsTable.weekId],
    references: [weeksTable.id],
  }),
}));

export const weekRecipesRelations = relations(weekRecipesTable, ({ one }) => ({
  week: one(weeksTable, {
    fields: [weekRecipesTable.weekId],
    references: [weeksTable.id],
  }),
  recipe: one(recipesTable, {
    fields: [weekRecipesTable.recipeId],
    references: [recipesTable.id],
  }),
}));

export const recipeRelationsRelations = relations(recipeRelationsTable, ({ one }) => ({
  mainRecipe: one(recipesTable, {
    fields: [recipeRelationsTable.mainRecipeId],
    references: [recipesTable.id],
    relationName: "mainRecipe",
  }),
  sideRecipe: one(recipesTable, {
    fields: [recipeRelationsTable.sideRecipeId],
    references: [recipesTable.id],
    relationName: "sideRecipe",
  }),
}));

export const groceryListTemplatesRelations = relations(groceryListTemplatesTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [groceryListTemplatesTable.teamId],
    references: [teamTable.id],
  }),
}));

export const aiUsageRelations = relations(aiUsageTable, ({ one }) => ({
  user: one(userTable, {
    fields: [aiUsageTable.userId],
    references: [userTable.id],
  }),
  team: one(teamTable, {
    fields: [aiUsageTable.teamId],
    references: [teamTable.id],
  }),
}));

export const aiChatsRelations = relations(aiChatsTable, ({ one, many }) => ({
  user: one(userTable, {
    fields: [aiChatsTable.userId],
    references: [userTable.id],
  }),
  team: one(teamTable, {
    fields: [aiChatsTable.teamId],
    references: [teamTable.id],
  }),
  messages: many(aiMessagesTable),
  runs: many(aiRunsTable),
}));

export const aiMessagesRelations = relations(aiMessagesTable, ({ one, many }) => ({
  chat: one(aiChatsTable, {
    fields: [aiMessagesTable.chatId],
    references: [aiChatsTable.id],
  }),
  parts: many(aiMessagePartsTable),
}));

export const aiMessagePartsRelations = relations(aiMessagePartsTable, ({ one }) => ({
  message: one(aiMessagesTable, {
    fields: [aiMessagePartsTable.messageId],
    references: [aiMessagesTable.id],
  }),
}));

export const aiRunsRelations = relations(aiRunsTable, ({ one, many }) => ({
  chat: one(aiChatsTable, {
    fields: [aiRunsTable.chatId],
    references: [aiChatsTable.id],
  }),
  user: one(userTable, {
    fields: [aiRunsTable.userId],
    references: [userTable.id],
  }),
  team: one(teamTable, {
    fields: [aiRunsTable.teamId],
    references: [teamTable.id],
  }),
  toolExecutions: many(aiToolExecutionsTable),
}));

export const aiToolExecutionsRelations = relations(aiToolExecutionsTable, ({ one }) => ({
  run: one(aiRunsTable, {
    fields: [aiToolExecutionsTable.runId],
    references: [aiRunsTable.id],
  }),
}));

// User relations
export const userRelations = relations(userTable, ({ many }) => ({
  teamMemberships: many(teamMembershipTable),
  aiUsage: many(aiUsageTable),
  aiChats: many(aiChatsTable),
}));

// Type exports
export type User = InferSelectModel<typeof userTable>;
export type Team = InferSelectModel<typeof teamTable>;
export type TeamMembership = InferSelectModel<typeof teamMembershipTable>;
export type TeamRole = InferSelectModel<typeof teamRoleTable>;
export type TeamInvitation = InferSelectModel<typeof teamInvitationTable>;
export type TeamSettings = InferSelectModel<typeof teamSettingsTable>;
export type TeamEntitlementSnapshot = InferSelectModel<typeof teamEntitlementSnapshotsTable>;
export type TeamSubscription = InferSelectModel<typeof teamSubscriptionsTable>;
export type AppleSubscriptionBinding = InferSelectModel<typeof appleSubscriptionBindingsTable>;
export type AppleServerNotificationEvent = InferSelectModel<typeof appleServerNotificationEventsTable>;
export type TeamFeatureUsage = InferSelectModel<typeof teamFeatureUsageTable>;
export type RecipeBook = InferSelectModel<typeof recipeBooksTable>;
export type Recipe = InferSelectModel<typeof recipesTable>;
export type Week = InferSelectModel<typeof weeksTable>;
export type WeekRecipe = InferSelectModel<typeof weekRecipesTable>;
export type RecipeRelation = InferSelectModel<typeof recipeRelationsTable>;
export type GroceryItem = InferSelectModel<typeof groceryItemsTable>;
export type GroceryListTemplate = InferSelectModel<typeof groceryListTemplatesTable>;
export type SyncMutation = InferSelectModel<typeof syncMutationsTable>;
export type SyncEntity = InferSelectModel<typeof syncEntitiesTable>;
export type SyncChange = InferSelectModel<typeof syncChangesTable>;
export type AiUsage = InferSelectModel<typeof aiUsageTable>;
export type AiChat = InferSelectModel<typeof aiChatsTable>;
export type AiMessage = InferSelectModel<typeof aiMessagesTable>;
export type AiMessagePart = InferSelectModel<typeof aiMessagePartsTable>;
export type AiRun = InferSelectModel<typeof aiRunsTable>;
export type AiToolExecution = InferSelectModel<typeof aiToolExecutionsTable>;
