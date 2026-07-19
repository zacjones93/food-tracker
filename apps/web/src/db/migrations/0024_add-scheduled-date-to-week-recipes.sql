-- Migration number: 0024 	 2025-10-26T22:37:00.000Z

-- Add scheduledDate column to week_recipes table for assigning recipes to specific dates
ALTER TABLE week_recipes ADD COLUMN scheduledDate INTEGER;

-- Create index for efficient querying by scheduled date
CREATE INDEX wr_scheduled_date_idx ON week_recipes(scheduledDate);
