-- Seed Default Team, User, and Membership for Team Re-Integration

-- Create default team
INSERT OR IGNORE INTO team (id, name, slug, description, createdAt, updatedAt, updateCounter)
SELECT
  'team_default',
  'Default Team',
  'default',
  'Default team for food tracking',
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0;

-- Create default user (if not exists)
-- Password: 'password123' (Argon2 hash - replace with proper hash in production)
INSERT OR IGNORE INTO user (
  id,
  email,
  passwordHash,
  firstName,
  lastName,
  role,
  createdAt,
  updatedAt,
  updateCounter
)
VALUES (
  'usr_default',
  'default@foodtracker.local',
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'Default',
  'User',
  'user',
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
);

-- Create team membership for default user (owner role)
INSERT OR IGNORE INTO team_membership (
  id,
  teamId,
  userId,
  roleId,
  isSystemRole,
  joinedAt,
  isActive,
  createdAt,
  updatedAt,
  updateCounter
)
SELECT
  'tmem_default',
  'team_default',
  'usr_default',
  'owner',
  1,
  strftime('%s', 'now'),
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0;

-- Add primary user to default team (if exists)
INSERT OR IGNORE INTO team_membership (
  id,
  teamId,
  userId,
  roleId,
  isSystemRole,
  joinedAt,
  isActive,
  createdAt,
  updatedAt,
  updateCounter
)
SELECT
  'tmem_default_primary',
  'team_default',
  id,
  'owner',
  1,
  strftime('%s', 'now'),
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
FROM user
WHERE email = 'zacjones93@gmail.com';

-- Create Personal Team for testing team switching
INSERT OR IGNORE INTO team (id, name, slug, description, createdAt, updatedAt, updateCounter)
SELECT
  'team_personal',
  'Personal Team',
  'personal',
  'Personal food tracking team',
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0;

-- Add primary user to Personal Team (if exists)
INSERT OR IGNORE INTO team_membership (
  id,
  teamId,
  userId,
  roleId,
  isSystemRole,
  joinedAt,
  isActive,
  createdAt,
  updatedAt,
  updateCounter
)
SELECT
  'tmem_personal_primary',
  'team_personal',
  id,
  'owner',
  1,
  strftime('%s', 'now'),
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
FROM user
WHERE email = 'zacjones93@gmail.com';

-- Assign all existing weeks to default team
UPDATE weeks
SET teamId = 'team_default'
WHERE teamId IS NULL;

-- Create default grocery template (no team assignment, globally accessible)
INSERT OR IGNORE INTO grocery_list_templates (
  id,
  name,
  isDefault,
  teamId,
  template,
  createdAt,
  updatedAt
)
VALUES (
  'glt_default',
  'Default Grocery Template',
  1,
  NULL,
  '[{"category":"Produce","order":0,"items":[{"name":"Bananas","order":0},{"name":"Apples","order":1}]},{"category":"Meat","order":1,"items":[{"name":"Chicken","order":0}]},{"category":"Dairy","order":2,"items":[{"name":"Milk","order":0},{"name":"Eggs","order":1}]}]',
  strftime('%s', 'now'),
  strftime('%s', 'now')
);
