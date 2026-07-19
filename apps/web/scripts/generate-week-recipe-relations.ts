import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';

// Load .env.local file
dotenv.config({ path: '.env.local' });

if (!process.env.NOTION_API_KEY) {
  throw new Error('NOTION_API_KEY environment variable is required');
}

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

interface WeekRecipeRelation {
  weekId: string;
  weekName: string;
  recipeIds: string[];
}

async function findScheduleDatabase() {
  console.log('Searching for Food Schedule database...');
  const searchResponse = await notion.search({
    filter: {
      property: 'object',
      value: 'data_source',
    },
  });

  const scheduleDb = searchResponse.results.find((db: any) => {
    const title = db.title?.[0]?.plain_text || '';
    return title.toLowerCase().includes('schedule') ||
           title.toLowerCase().includes('week') ||
           title.toLowerCase().includes('food schedule');
  });

  if (!scheduleDb) {
    throw new Error('Food Schedule database not found.');
  }

  return scheduleDb.id;
}

async function fetchSchedulePages(databaseId: string) {
  console.log('Fetching schedule pages...');
  let allResults: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response = await notion.dataSources.query({
      data_source_id: databaseId,
      start_cursor: startCursor,
      page_size: 100,
    });

    allResults = allResults.concat(response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  return allResults;
}

async function extractWeekRecipeRelations(pageId: string): Promise<WeekRecipeRelation | null> {
  try {
    // Fetch the full page with notion.pages.retrieve() to get populated relations
    const page = await notion.pages.retrieve({ page_id: pageId });
    const properties = (page as any).properties;

    // Get week name
    const nameProperty = Object.values(properties).find(
      (prop: any) => prop.type === 'title'
    ) as any;
    const weekName = nameProperty?.title?.[0]?.plain_text;

    if (!weekName) {
      return null;
    }

    // Find ALL relation properties and log them
    const allRelations = Object.entries(properties)
      .filter(([_, prop]: [string, any]) => prop.type === 'relation');

    console.log(`\nWeek: ${weekName}`);
    console.log(`  Relation properties found: ${allRelations.length}`);

    for (const [key, prop] of allRelations) {
      const relations = (prop as any).relation || [];
      console.log(`    - "${key}": ${relations.length} items`);

      // Debug: log the actual structure
      if (key === 'Our Recipes') {
        if (relations.length === 0) {
          console.log(`      Raw property value:`, JSON.stringify(prop, null, 2));
        } else {
          console.log(`      ✓ Found ${relations.length} recipes!`);
          console.log(`      First recipe ID:`, relations[0].id);
        }
      }
    }

    // Try to find recipes relation
    const recipesProperty = properties['Our Recipes'] ||
                            properties['Recipes'] ||
                            properties['Recipe'] ||
                            allRelations.find(([key]) =>
                              key.toLowerCase().includes('recipe')
                            )?.[1] as any;

    const recipeIds = recipesProperty?.relation?.map((rel: any) => rel.id) || [];

    return {
      weekId: pageId,
      weekName,
      recipeIds,
    };
  } catch (error) {
    console.error(`Error fetching page ${pageId}:`, error);
    return null;
  }
}

function generateWeekRecipeInserts(relations: WeekRecipeRelation[]): string[] {
  const now = Date.now();
  const inserts: string[] = [];

  for (const week of relations) {
    if (week.recipeIds.length === 0) continue;

    // Use Notion page ID directly as weekId (same approach as recipes)
    const weekId = week.weekId;

    for (let i = 0; i < week.recipeIds.length; i++) {
      const id = `wr_${createId()}`;
      const recipeId = week.recipeIds[i];

      inserts.push(
        `INSERT INTO week_recipes (id, weekId, recipeId, "order", createdAt)`,
        `VALUES ('${id}', '${weekId}', '${recipeId}', ${i}, ${now});`
      );
    }
  }

  return inserts;
}

async function main() {
  console.log('Starting Week-Recipe Relations Generator...\n');

  const scheduleDatabaseId = await findScheduleDatabase();
  const pages = await fetchSchedulePages(scheduleDatabaseId);
  console.log(`Found ${pages.length} schedule pages\n`);

  const relations: WeekRecipeRelation[] = [];

  console.log('Fetching individual page details (with relations)...\n');

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    process.stdout.write(`\rProcessing ${i + 1}/${pages.length}...`);

    const relation = await extractWeekRecipeRelations(page.id);
    if (relation) {
      relations.push(relation);
    }

    // Add small delay to avoid rate limiting
    if (i < pages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n');

  const weeksWithRecipes = relations.filter(r => r.recipeIds.length > 0);
  const totalRecipes = relations.reduce((sum, r) => sum + r.recipeIds.length, 0);

  console.log(`\n\nSummary:`);
  console.log(`  ${relations.length} weeks processed`);
  console.log(`  ${weeksWithRecipes.length} weeks have recipes`);
  console.log(`  ${totalRecipes} total recipe relations`);

  if (totalRecipes === 0) {
    console.log('\n⚠️  No recipe relations found!');
    console.log('Please check:');
    console.log('  1. Your Notion schedule pages have recipes linked');
    console.log('  2. The relation property name is correct');
    console.log('  3. The Notion integration has access to both databases');
    return;
  }

  const sqlStatements = [
    '-- Week-Recipe Relations',
    '-- Generated from Notion Food Schedule database',
    `-- Date: ${new Date().toISOString()}`,
    '-- Note: Week IDs and Recipe IDs are Notion page IDs',
    '',
    ...generateWeekRecipeInserts(relations),
  ];

  const sql = sqlStatements.join('\n');
  const outputPath = './src/db/week-recipe-relations.sql';
  fs.writeFileSync(outputPath, sql, 'utf-8');

  console.log(`\n✅ Successfully generated ${outputPath}`);
  console.log(`   ${totalRecipes} recipe relations inserted`);
}

main().catch(console.error);
