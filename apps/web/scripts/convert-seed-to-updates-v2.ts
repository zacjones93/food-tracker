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

for (const line of lines) {
  if (!line.startsWith('INSERT INTO recipes ')) continue;

  // Find VALUES section
  const valuesIdx = line.indexOf('VALUES (');
  if (valuesIdx === -1) continue;

  const valuesStr = line.substring(valuesIdx + 8); // Skip 'VALUES ('

  // Parse fields manually - first field is ID
  let pos = 0;
  let fieldCount = 0;
  let inString = false;
  let escaped = false;
  let currentField = '';
  let recipeId = '';
  let ingredients = '';

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (escaped) {
      currentField += char;
      escaped = false;
      continue;
    }

    if (char === "'") {
      if (inString) {
        // Check if next char is also '
        if (valuesStr[i + 1] === "'") {
          currentField += "''";
          i++; // Skip next '
          continue;
        }
        inString = false;
      } else {
        inString = true;
      }
      continue;
    }

    if (!inString && char === ',') {
      // End of field
      if (fieldCount === 0) {
        recipeId = currentField.trim();
      } else if (fieldCount === 10) { // ingredients is 11th field (index 10)
        ingredients = currentField.trim();
      }
      fieldCount++;
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (recipeId && ingredients) {
    const updateStmt = `UPDATE recipes SET ingredients = ${ingredients} WHERE id = ${recipeId};`;
    outputLines.push(updateStmt);
    updateCount++;
  }
}

writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`✅ Converted ${updateCount} INSERT statements to UPDATE statements`);
console.log(`Output: ${outputPath}`);
