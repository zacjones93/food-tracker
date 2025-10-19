import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
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
} as const;

// Recipe visibility options
export const RECIPE_VISIBILITY = {
  PUBLIC: 'public',      // Everyone can see, shows in search
  PRIVATE: 'private',    // Only owning team can see
  UNLISTED: 'unlisted',  // Everyone can see, hidden from search
} as const;

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
  invitedBy: text().references(() => userTable.id),
  joinedAt: integer({ mode: "timestamp" }),
  isActive: integer().default(1).notNull(),
}, (table) => ([
  index("tm_team_idx").on(table.teamId),
  index("tm_user_idx").on(table.userId),
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
  invitedBy: text().notNull().references(() => userTable.id),
  expiresAt: integer({ mode: "timestamp" }).notNull(),
  acceptedAt: integer({ mode: "timestamp" }),
  acceptedBy: text().references(() => userTable.id),
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
}, (table) => ([
  index("tset_team_idx").on(table.teamId),
]));

// Recipe books table
export const recipeBooksTable = sqliteTable("recipe_books", {
  id: text().primaryKey().$defaultFn(() => `rb_${createId()}`).notNull(),
  name: text({ length: 500 }).notNull().unique(),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("recipe_books_name_idx").on(table.name),
]));

// Recipes table
export const recipesTable = sqliteTable("recipes", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `rcp_${createId()}`).notNull(),

  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),

  // Core fields
  name: text({ length: 500 }).notNull(),
  emoji: text({ length: 10 }),  // Recipe icon

  // Metadata
  tags: text({ mode: 'json' }).$type<string[]>(),  // JSON array of tags
  mealType: text({ length: 50 }),  // "Lunch", "Dinner", "Breakfast"
  difficulty: text({ length: 20 }),  // "Easy", "Medium", "Hard"
  visibility: text({ length: 20 }).notNull().default('public'),  // "public", "private", "unlisted"

  // Source tracking
  recipeLink: text({ length: 1000 }),  // URL to original recipe
  recipeBookId: text().references(() => recipeBooksTable.id, { onDelete: 'set null' }),
  page: text({ length: 50 }),  // Page number in recipe book

  // Tracking
  lastMadeDate: integer({ mode: 'timestamp' }),
  mealsEatenCount: integer().default(0).notNull(),

  // Content
  ingredients: text({ mode: 'json' }).$type<string[]>(),  // JSON array of ingredients
  recipeBody: text(),  // Full recipe instructions (markdown)
}, (table) => ([
  index("recipes_name_idx").on(table.name),
  index("recipes_book_idx").on(table.recipeBookId),
  index("recipes_team_idx").on(table.teamId),
  index("recipes_visibility_idx").on(table.visibility),
]));

// Weeks table
export const weeksTable = sqliteTable("weeks", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `wk_${createId()}`).notNull(),

  teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),

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
]));

// Many-to-many: Weeks ↔ Recipes
export const weekRecipesTable = sqliteTable("week_recipes", {
  id: text().primaryKey().$defaultFn(() => `wr_${createId()}`).notNull(),
  weekId: text().notNull().references(() => weeksTable.id, { onDelete: 'cascade' }),
  recipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),

  order: integer().default(0),  // Display order in week
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("wr_week_idx").on(table.weekId),
  index("wr_recipe_idx").on(table.recipeId),
  index("wr_unique_idx").on(table.weekId, table.recipeId),
]));

// Self-referencing: Recipe ↔ Recipe (sides/accompaniments)
export const recipeRelationsTable = sqliteTable("recipe_relations", {
  id: text().primaryKey().$defaultFn(() => `rr_${createId()}`).notNull(),
  mainRecipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),
  sideRecipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),

  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ([
  index("rr_main_idx").on(table.mainRecipeId),
  index("rr_side_idx").on(table.sideRecipeId),
]));

// Grocery items for weeks
export const groceryItemsTable = sqliteTable("grocery_items", {
  id: text().primaryKey().$defaultFn(() => `gi_${createId()}`).notNull(),
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
]));

// Grocery list templates
export const groceryListTemplatesTable = sqliteTable("grocery_list_templates", {
  id: text().primaryKey().$defaultFn(() => `glt_${createId()}`).notNull(),
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
]));

// Relations
export const recipeBooksRelations = relations(recipeBooksTable, ({ many }) => ({
  recipes: many(recipesTable),
}));

// Team relations
export const teamRelations = relations(teamTable, ({ many, one }) => ({
  memberships: many(teamMembershipTable),
  invitations: many(teamInvitationTable),
  roles: many(teamRoleTable),
  weeks: many(weeksTable),
  recipes: many(recipesTable),
  groceryTemplates: many(groceryListTemplatesTable),
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

// User relations
export const userRelations = relations(userTable, ({ many }) => ({
  teamMemberships: many(teamMembershipTable),
}));

// Type exports
export type User = InferSelectModel<typeof userTable>;
export type Team = InferSelectModel<typeof teamTable>;
export type TeamMembership = InferSelectModel<typeof teamMembershipTable>;
export type TeamRole = InferSelectModel<typeof teamRoleTable>;
export type TeamInvitation = InferSelectModel<typeof teamInvitationTable>;
export type RecipeBook = InferSelectModel<typeof recipeBooksTable>;
export type Recipe = InferSelectModel<typeof recipesTable>;
export type Week = InferSelectModel<typeof weeksTable>;
export type WeekRecipe = InferSelectModel<typeof weekRecipesTable>;
export type RecipeRelation = InferSelectModel<typeof recipeRelationsTable>;
export type GroceryItem = InferSelectModel<typeof groceryItemsTable>;
export type GroceryListTemplate = InferSelectModel<typeof groceryListTemplatesTable>;
