#!/usr/bin/env tsx
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

const outputLines: string[] = [
  '-- Update ingredients for recipes',
  '-- Generated from seed-with-ingredients.sql',
  `-- Date: ${new Date().toISOString()}`,
  '',
];

let updateCount = 0;
let insideInsert = false;
let currentInsert = '';

for (const line of lines) {
  // Start of INSERT
  if (line.startsWith('INSERT INTO recipes ')) {
    insideInsert = true;
    currentInsert = line + '\n';
    continue;
  }

  // Accumulate lines
  if (insideInsert) {
    currentInsert += line + '\n';

    // Check if this is the end
    if (line.trim().endsWith(');')) {
      // Extract ID and ingredients using regex on the full INSERT
      // Looking for: VALUES ('ID', 'name', 'emoji', tags, mealType, diff, link, bookId, page, lastMade, count, 'ingredients', 'body', ...
      const match = currentInsert.match(/VALUES \('([^']+)'[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,\s*(\d+),\s*'(\[[^\]]*\])',/s);

      if (match) {
        const recipeId = match[1];
        const ingredients = match[3];

        const updateStmt = `UPDATE recipes SET ingredients = '${ingredients}' WHERE id = '${recipeId}';`;
        outputLines.push(updateStmt);
        updateCount++;
      }

      insideInsert = false;
      currentInsert = '';
    }
  }
}

writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`✅ Converted ${updateCount} INSERT statements to UPDATE statements`);
console.log(`Output: ${outputPath}`);
