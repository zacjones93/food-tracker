-- Migration number: 0014 	 2025-10-17T22:00:00.000Z

-- Add grocery_list_templates table
CREATE TABLE grocery_list_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX glt_name_idx ON grocery_list_templates(name);
