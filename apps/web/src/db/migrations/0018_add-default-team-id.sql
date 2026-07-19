ALTER TABLE `user` ADD `defaultTeamId` text REFERENCES team(id) ON DELETE SET NULL;
