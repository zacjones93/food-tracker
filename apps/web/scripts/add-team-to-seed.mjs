#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const seedPath = join(__dirname, '../src/db/seed.sql');
const teamId = 'team_default';

console.log('Reading seed file...');
let content = readFileSync(seedPath, 'utf-8');

// Split content into lines for precise processing
const lines = content.split('\n');
const result = [];
let inRecipesSection = false;
let updatedCount = 0;
let lastWasRecipeInsert = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Add team insert right before "-- Recipes" marker
  if (line === '-- Recipes') {
    result.push('-- Recipes');
    inRecipesSection = true;
    lastWasRecipeInsert = false;
    continue;
  }

  // Update recipe INSERT statements
  if (inRecipesSection && line.startsWith('INSERT INTO recipes (id,')) {
    result.push(line.replace(
      'INSERT INTO recipes (id,',
      'INSERT INTO recipes (id, teamId,'
    ));
    lastWasRecipeInsert = true;
  }
  // Update VALUES for recipes (only lines starting with VALUES after recipe INSERT)
  else if (inRecipesSection && line.startsWith('VALUES (') && lastWasRecipeInsert) {
    // Match VALUES ('id', ... pattern and insert teamId after id
    const match = line.match(/^VALUES \('([^']+)', /);
    if (match) {
      const [, id] = match;
      result.push(line.replace(
        `VALUES ('${id}', `,
        `VALUES ('${id}', '${teamId}', `
      ));
      updatedCount++;
    } else {
      result.push(line);
    }
    lastWasRecipeInsert = false;
  }
  else {
    result.push(line);
    lastWasRecipeInsert = false;
  }
}

// Write updated content
console.log('Writing updated seed file...');
writeFileSync(seedPath, result.join('\n'), 'utf-8');

console.log('✅ Done! Updated seed.sql with team ownership');
console.log(`   - Added team: ${teamId}`);
console.log(`   - Updated ${updatedCount} recipes`);
