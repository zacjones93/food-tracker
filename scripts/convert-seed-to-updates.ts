#!/usr/bin/env tsx
/**
 * Convert seed-with-ingredients.sql INSERT statements to UPDATE statements
 * This allows us to update just the ingredients column for existing recipes
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inputPath = resolve(__dirname, '../src/db/seed-with-ingredients.sql');
const outputPath = resolve(__dirname, '../src/db/update-ingredients.sql');

console.log('Converting INSERT to UPDATE statements...');

const content = readFileSync(inputPath, 'utf-8');
const lines = content.split('\n');
const outputLines: string[] = [];

// Add header
outputLines.push('-- Update ingredients for recipes');
outputLines.push('-- Generated from seed-with-ingredients.sql');
outputLines.push(`-- Date: ${new Date().toISOString()}`);
outputLines.push('');

let updateCount = 0;

for (const line of lines) {
  // Skip recipe book inserts
  if (line.startsWith('INSERT INTO recipe_books')) {
    continue;
  }

  // Match single-line recipe inserts
  if (line.startsWith('INSERT INTO recipes ')) {
    // Extract ID and ingredients from the INSERT
    // Pattern: VALUES ('ID', ..., mealsCount, 'ingredients', 'body', timestamps);
    const match = line.match(/VALUES \('([^']+)'.*?, (\d+), '(\[.*?\])', '.*?', \d+, \d+, \d+\);/);

    if (match) {
      const recipeId = match[1];
      const ingredientsJson = match[3];

      // Create UPDATE statement
      const updateStmt = `UPDATE recipes SET ingredients = '${ingredientsJson}' WHERE id = '${recipeId}';`;
      outputLines.push(updateStmt);
      updateCount++;
    }
  }
}

const finalContent = outputLines.join('\n');
writeFileSync(outputPath, finalContent, 'utf-8');

console.log(`✅ Converted ${updateCount} INSERT statements to UPDATE statements`);
console.log(`Output: ${outputPath}`);
