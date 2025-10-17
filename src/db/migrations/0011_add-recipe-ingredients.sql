-- Migration number: 0011 	 2025-10-17T17:20:00.000Z

-- Add ingredients column to recipes table
ALTER TABLE recipes ADD COLUMN ingredients TEXT;