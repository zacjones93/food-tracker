-- Migration number: 0009 	 2025-10-17T15:55:39.087Z

-- Drop all SaaS boilerplate tables
DROP TABLE IF EXISTS team_invitation;
DROP TABLE IF EXISTS team_role;
DROP TABLE IF EXISTS team_membership;
DROP TABLE IF EXISTS team;
DROP TABLE IF EXISTS purchased_item;
DROP TABLE IF EXISTS credit_transaction;
DROP TABLE IF EXISTS passkey_credential;

-- Create temporary user table without unwanted columns
CREATE TABLE user_new (
  id TEXT PRIMARY KEY NOT NULL,
  firstName TEXT,
  lastName TEXT,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT DEFAULT 'user' NOT NULL,
  avatar TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

-- Copy data from old user table (only columns that exist in both)
INSERT INTO user_new (id, firstName, lastName, email, passwordHash, role, avatar, createdAt, updatedAt, updateCounter)
SELECT id, firstName, lastName, email, passwordHash, role, avatar, createdAt, updatedAt, updateCounter
FROM user;

-- Drop old user table and rename new one
DROP TABLE user;
ALTER TABLE user_new RENAME TO user;

-- Create indexes for user table
CREATE INDEX email_idx ON user(email);
CREATE INDEX role_idx ON user(role);

-- Create recipes table
CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  tags TEXT,
  mealType TEXT,
  difficulty TEXT,
  lastMadeDate INTEGER,
  mealsEatenCount INTEGER DEFAULT 0 NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

CREATE INDEX recipes_name_idx ON recipes(name);

-- Create weeks table
CREATE TABLE weeks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  status TEXT DEFAULT 'upcoming' NOT NULL,
  startDate INTEGER,
  endDate INTEGER,
  weekNumber INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updateCounter INTEGER DEFAULT 0
);

CREATE INDEX weeks_status_idx ON weeks(status);
CREATE INDEX weeks_start_date_idx ON weeks(startDate);

-- Create week_recipes junction table
CREATE TABLE week_recipes (
  id TEXT PRIMARY KEY NOT NULL,
  weekId TEXT NOT NULL,
  recipeId TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (weekId) REFERENCES weeks(id) ON DELETE CASCADE,
  FOREIGN KEY (recipeId) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX wr_week_idx ON week_recipes(weekId);
CREATE INDEX wr_recipe_idx ON week_recipes(recipeId);
CREATE INDEX wr_unique_idx ON week_recipes(weekId, recipeId);

-- Create recipe_relations table for sides/accompaniments
CREATE TABLE recipe_relations (
  id TEXT PRIMARY KEY NOT NULL,
  mainRecipeId TEXT NOT NULL,
  sideRecipeId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (mainRecipeId) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (sideRecipeId) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX rr_main_idx ON recipe_relations(mainRecipeId);
CREATE INDEX rr_side_idx ON recipe_relations(sideRecipeId);
