-- Migration number: 0012 	 2025-10-17T17:20:00.000Z

-- Add grocery_items table for week grocery lists
CREATE TABLE grocery_items (
  id TEXT PRIMARY KEY NOT NULL,
  weekId TEXT NOT NULL,
  name TEXT NOT NULL,
  checked INTEGER DEFAULT 0 NOT NULL,
  "order" INTEGER DEFAULT 0,
  category TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (weekId) REFERENCES weeks(id) ON DELETE CASCADE
);

CREATE INDEX gi_week_idx ON grocery_items(weekId);
CREATE INDEX gi_order_idx ON grocery_items(weekId, "order");
