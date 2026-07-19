#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inputPath = resolve(__dirname, '../src/db/seed-with-ingredients.sql');
const content = readFileSync(inputPath, 'utf-8');

// Parse full INSERT statements (handling multiline)
let validCount = 0;
let invalidCount = 0;
let emptyCount = 0;
const errors: string[] = [];

// Split by INSERT INTO recipes to get each full statement
const recipeInserts = content.split(/INSERT INTO recipes/).filter(s => s.trim());

for (const insert of recipeInserts) {
  // Skip if not a valid VALUES statement
  if (!insert.includes('VALUES (')) continue;

  // Extract the VALUES portion
  const valuesMatch = insert.match(/VALUES \((.*?)\);/s);
  if (!valuesMatch) continue;

  const valuesStr = valuesMatch[1];

  // Extract ingredients - it's the 12th column (index 11) in the VALUES
  // Split by comma+space but respect quotes
  const fields: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];
    const nextChar = valuesStr[i + 1];

    if ((char === "'" || char === '"') && !insideQuotes) {
      insideQuotes = true;
      quoteChar = char;
      currentField += char;
    } else if (char === quoteChar && insideQuotes) {
      // Check if it's an escaped quote
      if (nextChar === quoteChar) {
        currentField += char + nextChar;
        i++; // Skip next char
      } else {
        insideQuotes = false;
        currentField += char;
      }
    } else if (char === ',' && !insideQuotes && nextChar === ' ') {
      fields.push(currentField.trim());
      currentField = '';
      i++; // Skip the space
    } else {
      currentField += char;
    }
  }

  // Don't forget the last field
  if (currentField.trim()) {
    fields.push(currentField.trim());
  }

  // Column 11 (0-indexed) is ingredients
  if (fields.length < 12) {
    invalidCount++;
    errors.push(`Not enough fields: ${fields.length}`);
    continue;
  }

  const ingredientsField = fields[11];

  // Remove surrounding quotes
  let ingredientsJson = ingredientsField;
  if (ingredientsJson.startsWith("'") && ingredientsJson.endsWith("'")) {
    ingredientsJson = ingredientsJson.slice(1, -1);
  }

  // Unescape SQL quotes
  ingredientsJson = ingredientsJson.replace(/''/g, "'");

  try {
    const parsed = JSON.parse(ingredientsJson);

    // Validate it's an array
    if (!Array.isArray(parsed)) {
      invalidCount++;
      errors.push(`Not an array: ${ingredientsJson.substring(0, 50)}`);
      continue;
    }

    // Validate all elements are strings
    const allStrings = parsed.every(item => typeof item === 'string');
    if (!allStrings) {
      invalidCount++;
      errors.push(`Non-string elements: ${ingredientsJson.substring(0, 50)}`);
      continue;
    }

    if (parsed.length === 0) {
      emptyCount++;
    }

    validCount++;
  } catch (error) {
    invalidCount++;
    errors.push(`JSON parse error: ${ingredientsJson.substring(0, 50)}`);
  }
}

console.log('\n=== VALIDATION RESULTS ===');
console.log(`Total recipes validated: ${validCount + invalidCount}`);
console.log(`✓ Valid JSON arrays: ${validCount}`);
console.log(`  - Non-empty: ${validCount - emptyCount}`);
console.log(`  - Empty: ${emptyCount}`);
console.log(`✗ Invalid: ${invalidCount}`);

if (errors.length > 0) {
  console.log(`\nFirst 10 errors:`);
  errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
}
