#!/bin/bash

# Extract INSERT statements in correct dependency order
BACKUP_DB="backup-20251027-101400.sqlite"
OUTPUT_FILE="scripts/restore-data-ordered.sql"

# Tables in dependency order
TABLES="user team team_role team_membership team_invitation team_settings recipe_books recipes recipe_relations weeks week_recipes grocery_items grocery_list_templates tags revalidations"

for table in $TABLES; do
  echo "-- Inserting data for $table" >> $OUTPUT_FILE
  sqlite3 $BACKUP_DB ".dump $table" | grep "^INSERT INTO $table" >> $OUTPUT_FILE
done

# Add footer
echo "" >> $OUTPUT_FILE
echo "-- Re-enable foreign keys" >> $OUTPUT_FILE
echo "PRAGMA foreign_keys = ON;" >> $OUTPUT_FILE
