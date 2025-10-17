import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';

/**
 * Manual Week-Recipe Relations Generator
 *
 * Since Notion API isn't returning relation data, we'll create a simple
 * mapping structure you can populate manually or from another source.
 *
 * Instructions:
 * 1. Update the WEEK_RECIPES mapping below with your actual data
 * 2. Week IDs should match those in weeks-seed.sql
 * 3. Recipe IDs should match those in seed.sql (Notion page IDs)
 * 4. Run: pnpm tsx scripts/manual-create-relations.ts
 */

// Example structure - replace with your actual mappings
const WEEK_RECIPES: Record<string, string[]> = {
  // Format: 'wk_xxxx': ['recipe-notion-id-1', 'recipe-notion-id-2']

  // Example:
  // 'wk_cr27x7zjusvore53xxmw7pfv': [
  //   '28fde7a2-c4fc-81a7-93d8-c1234567890',  // Recipe 1 Notion ID
  //   '28fde7a2-c4fc-81a7-93d8-c9876543210',  // Recipe 2 Notion ID
  // ],

  // Add your mappings here...
};

function generateWeekRecipeInserts(): string[] {
  const now = Date.now();
  const inserts: string[] = [];

  for (const [weekId, recipeIds] of Object.entries(WEEK_RECIPES)) {
    recipeIds.forEach((recipeId, index) => {
      const id = `wr_${createId()}`;
      inserts.push(
        `INSERT INTO week_recipes (id, weekId, recipeId, "order", createdAt)`,
        `VALUES ('${id}', '${weekId}', '${recipeId}', ${index}, ${now});`
      );
    });
  }

  return inserts;
}

function main() {
  console.log('Generating manual week-recipe relations...\n');

  if (Object.keys(WEEK_RECIPES).length === 0) {
    console.log('⚠️  No mappings defined in WEEK_RECIPES constant.');
    console.log('\nTo use this script:');
    console.log('1. Open scripts/manual-create-relations.ts');
    console.log('2. Add your week → recipes mappings to WEEK_RECIPES');
    console.log('3. Run this script again');
    console.log('\nExample mapping:');
    console.log(`  'wk_abc123': ['recipe-id-1', 'recipe-id-2'],`);
    return;
  }

  const totalRelations = Object.values(WEEK_RECIPES)
    .reduce((sum, recipes) => sum + recipes.length, 0);

  const sqlStatements = [
    '-- Week-Recipe Relations (Manual)',
    `-- Generated: ${new Date().toISOString()}`,
    `-- ${totalRelations} relations`,
    '',
    ...generateWeekRecipeInserts(),
  ];

  const sql = sqlStatements.join('\n');
  const outputPath = './src/db/week-recipe-relations.sql';
  fs.writeFileSync(outputPath, sql, 'utf-8');

  console.log(`✅ Generated ${outputPath}`);
  console.log(`   ${Object.keys(WEEK_RECIPES).length} weeks`);
  console.log(`   ${totalRelations} recipe relations`);
}

main();
