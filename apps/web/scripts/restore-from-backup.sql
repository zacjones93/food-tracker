-- Restore data from backup database (data only, no migrations)
-- This script attaches the backup database and copies all data to the current database
-- Excludes: d1_migrations, _cf_METADATA (system tables)

-- Attach the backup database (using absolute path)
ATTACH DATABASE '/Users/zacjones/Documents/02.Areas/personal/food-tracker/food-tracker/backup-20251027-101400.sqlite' AS backup;

-- Disable foreign keys temporarily to avoid constraint issues during deletion
PRAGMA foreign_keys = OFF;

-- Clear existing data from main database (preserve AI tables which are new)
DELETE FROM week_recipes;
DELETE FROM recipe_relations;
DELETE FROM grocery_items;
DELETE FROM grocery_list_templates;
DELETE FROM weeks;
DELETE FROM recipes;
DELETE FROM recipe_books;
DELETE FROM tags;
DELETE FROM team_settings;
DELETE FROM team_invitation;
DELETE FROM team_membership;
DELETE FROM team_role;
DELETE FROM team;
DELETE FROM user;
DELETE FROM revalidations;

-- Copy data from backup to main database
-- Order matters due to foreign key constraints

-- 1. Users (no dependencies)
INSERT INTO user SELECT * FROM backup.user;

-- 2. Teams (no dependencies)
INSERT INTO team SELECT * FROM backup.team;

-- 3. Team roles (depends on team)
INSERT INTO team_role SELECT * FROM backup.team_role;

-- 4. Team memberships (depends on user, team, team_role)
INSERT INTO team_membership SELECT * FROM backup.team_membership;

-- 5. Team invitations (depends on team, team_role)
INSERT INTO team_invitation SELECT * FROM backup.team_invitation;

-- 6. Team settings (depends on team)
INSERT INTO team_settings SELECT * FROM backup.team_settings;

-- 7. Recipe books (no dependencies)
INSERT INTO recipe_books SELECT * FROM backup.recipe_books;

-- 8. Recipes (depends on team, recipe_books)
INSERT INTO recipes SELECT * FROM backup.recipes;

-- 9. Recipe relations (depends on recipes)
INSERT INTO recipe_relations SELECT * FROM backup.recipe_relations;

-- 10. Weeks (depends on team)
INSERT INTO weeks SELECT * FROM backup.weeks;

-- 11. Week recipes (depends on weeks, recipes)
INSERT INTO week_recipes SELECT * FROM backup.week_recipes;

-- 12. Grocery items (depends on weeks)
INSERT INTO grocery_items SELECT * FROM backup.grocery_items;

-- 13. Grocery list templates (depends on team)
INSERT INTO grocery_list_templates SELECT * FROM backup.grocery_list_templates;

-- 14. Tags (no dependencies)
INSERT INTO tags SELECT * FROM backup.tags;

-- 15. Revalidations (no dependencies)
INSERT INTO revalidations SELECT * FROM backup.revalidations;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;

-- Detach backup database
DETACH DATABASE backup;

-- Verify the migration
SELECT 'Users: ' || COUNT(*) FROM user;
SELECT 'Teams: ' || COUNT(*) FROM team;
SELECT 'Team Memberships: ' || COUNT(*) FROM team_membership;
SELECT 'Team Roles: ' || COUNT(*) FROM team_role;
SELECT 'Team Invitations: ' || COUNT(*) FROM team_invitation;
SELECT 'Team Settings: ' || COUNT(*) FROM team_settings;
SELECT 'Recipe Books: ' || COUNT(*) FROM recipe_books;
SELECT 'Recipes: ' || COUNT(*) FROM recipes;
SELECT 'Recipe Relations: ' || COUNT(*) FROM recipe_relations;
SELECT 'Weeks: ' || COUNT(*) FROM weeks;
SELECT 'Week Recipes: ' || COUNT(*) FROM week_recipes;
SELECT 'Grocery Items: ' || COUNT(*) FROM grocery_items;
SELECT 'Grocery Templates: ' || COUNT(*) FROM grocery_list_templates;
SELECT 'Tags: ' || COUNT(*) FROM tags;
