import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { type InferSelectModel } from "drizzle-orm";

import { createId } from '@paralleldrive/cuid2'

export const ROLES_ENUM = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

const roleTuple = Object.values(ROLES_ENUM) as [string, ...string[]];

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
}, (table) => ([
  index('email_idx').on(table.email),
  index('role_idx').on(table.role),
]));

// Recipes table
export const recipesTable = sqliteTable("recipes", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `rcp_${createId()}`).notNull(),

  // Core fields
  name: text({ length: 500 }).notNull(),
  emoji: text({ length: 10 }),  // Recipe icon

  // Metadata
  tags: text({ mode: 'json' }).$type<string[]>(),  // JSON array of tags
  mealType: text({ length: 50 }),  // "Lunch", "Dinner", "Breakfast"
  difficulty: text({ length: 20 }),  // "Easy", "Medium", "Hard"

  // Tracking
  lastMadeDate: integer({ mode: 'timestamp' }),
  mealsEatenCount: integer().default(0).notNull(),

  // Content
  ingredients: text({ mode: 'json' }).$type<string[]>(),  // JSON array of ingredients
  recipeBody: text(),  // Full recipe instructions (markdown)
}, (table) => ([
  index("recipes_name_idx").on(table.name),
]));

// Weeks table
export const weeksTable = sqliteTable("weeks", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `wk_${createId()}`).notNull(),

  name: text({ length: 255 }).notNull(),  // "Oct 14th - 19th, 2025"
  emoji: text({ length: 10 }),

  status: text({ length: 50 }).notNull().default('upcoming'),
  // Values: "current", "upcoming", "archived"

  startDate: integer({ mode: 'timestamp' }),
  endDate: integer({ mode: 'timestamp' }),

  weekNumber: integer(),  // Numeric identifier if needed

  // Grocery list stored as page content (markdown checklist)
}, (table) => ([
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

// Relations
export const recipesRelations = relations(recipesTable, ({ many }) => ({
  weeks: many(weekRecipesTable),
  sideRecipes: many(recipeRelationsTable, { relationName: "mainRecipe" }),
  mainRecipes: many(recipeRelationsTable, { relationName: "sideRecipe" }),
}));

export const weeksRelations = relations(weeksTable, ({ many }) => ({
  recipes: many(weekRecipesTable),
  groceryItems: many(groceryItemsTable),
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

// Simplified user relations - no more teams, credits, passkeys, or purchases
export const userRelations = relations(userTable, ({ many }) => ({
  // Relations will be added here as we build recipes and weeks tables
}));

// Type exports
export type User = InferSelectModel<typeof userTable>;
export type Recipe = InferSelectModel<typeof recipesTable>;
export type Week = InferSelectModel<typeof weeksTable>;
export type WeekRecipe = InferSelectModel<typeof weekRecipesTable>;
export type RecipeRelation = InferSelectModel<typeof recipeRelationsTable>;
export type GroceryItem = InferSelectModel<typeof groceryItemsTable>;
