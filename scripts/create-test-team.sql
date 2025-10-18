-- Create second test team for team switching testing

-- Create "Personal Team"
INSERT INTO team (id, name, slug, description, avatarUrl, createdAt, updatedAt, updateCounter)
VALUES (
  'team_personal',
  'Personal Team',
  'personal',
  'Personal food tracking team',
  NULL,
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
);

-- Add primary user (zacjones93@gmail.com) to Personal Team as owner
INSERT INTO team_membership (id, teamId, userId, roleId, isSystemRole, invitedBy, joinedAt, isActive, createdAt, updatedAt, updateCounter)
VALUES (
  'tmem_personal_zac',
  'team_personal',
  'usr_jgm7n0063xi60ns26k0ym2wx',
  'owner',
  1,
  NULL,
  strftime('%s', 'now'),
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
);
