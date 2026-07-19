#!/usr/bin/env tsx
/**
 * Script to add teamId to weeks-seed.sql
 * Updates all INSERT statements to include teamId = 'team_default'
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SEED_FILE = join(process.cwd(), 'src/db/weeks-seed.sql');
const DEFAULT_TEAM_ID = 'team_default';

function updateWeeksSeed() {
  console.log('Reading weeks-seed.sql...');
  const content = readFileSync(SEED_FILE, 'utf-8');
  const lines = content.split('\n');

  let updatedLines: string[] = [];
  let updatedCount = 0;

  for (const line of lines) {
    // Check if this is a weeks INSERT statement (not week_recipes)
    if (line.startsWith('INSERT INTO weeks (')) {
      // Add teamId to column list after 'id,'
      const updated = line.replace(
        'INSERT INTO weeks (id,',
        `INSERT INTO weeks (id, teamId,`
      );
      updatedLines.push(updated);
      updatedCount++;
    }
    // Check if this is a VALUES line for weeks
    else if (line.match(/^VALUES \('[\w-]+',/) && updatedLines.length > 0 && updatedLines[updatedLines.length - 1].includes('INSERT INTO weeks')) {
      // Add 'team_default' after the first value (id)
      const updated = line.replace(
        /^VALUES \('([\w-]+)',/,
        `VALUES ('$1', '${DEFAULT_TEAM_ID}',`
      );
      updatedLines.push(updated);
    }
    else {
      updatedLines.push(line);
    }
  }

  console.log(`Updated ${updatedCount} INSERT statements`);

  // Write back to file
  const updatedContent = updatedLines.join('\n');
  writeFileSync(SEED_FILE, updatedContent, 'utf-8');

  console.log('✅ Successfully updated weeks-seed.sql');
}

try {
  updateWeeksSeed();
} catch (error) {
  console.error('Error updating weeks-seed.sql:', error);
  process.exit(1);
}
