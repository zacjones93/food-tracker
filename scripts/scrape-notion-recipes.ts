import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

if (!process.env.NOTION_API_KEY) {
  throw new Error('NOTION_API_KEY environment variable is required');
}

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

interface RecipeData {
  name: string;
  emoji?: string;
  tags?: string[];
  mealType?: string;
  difficulty?: string;
  recipeBody?: string;
}

async function getAllRecipeIdsFromSchedule(): Promise<Set<string>> {
  console.log('Step 1: Getting all recipe IDs from Food Schedule...\n');

  const SCHEDULE_DB_ID = '28fde7a2-c4fc-81a7-93d8-000b6ab25051';
  const recipeIds = new Set<string>();

  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response = await notion.dataSources.query({
      data_source_id: SCHEDULE_DB_ID,
      start_cursor: startCursor,
      page_size: 100,
    });

    for (const page of response.results) {
      const pageData = page as any;

      // Find relation properties
      const relationProps = Object.entries(pageData.properties)
        .filter(([_, prop]: [string, any]) => prop.type === 'relation');

      for (const [_, prop] of relationProps) {
        const relations = (prop as any).relation || [];
        for (const rel of relations) {
          recipeIds.add(rel.id);
        }
      }
    }

    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`✓ Found ${recipeIds.size} unique recipe IDs from schedule\n`);
  return recipeIds;
}

async function fetchPageContent(pageId: string): Promise<string | undefined> {
  try {
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const mdString = n2m.toMarkdownString(mdBlocks);
    return mdString.parent || undefined;
  } catch (error) {
    console.error(`Error fetching content for page ${pageId}:`, error);
    return undefined;
  }
}

async function mapNotionPageToRecipe(page: any): Promise<RecipeData | null> {
  try {
    const properties = page.properties;

    const nameProperty = Object.values(properties).find(
      (prop: any) => prop.type === 'title'
    ) as any;
    const name = nameProperty?.title?.[0]?.plain_text;

    if (!name) {
      return null;
    }

    const emoji = page.icon?.emoji || undefined;

    const tagsProperty = Object.values(properties).find(
      (prop: any) => prop.type === 'multi_select'
    ) as any;
    const tags = tagsProperty?.multi_select?.map((tag: any) => tag.name) || undefined;

    const mealTypeProperty = properties['Meal Type'] || properties['Type'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'select' && prop.name?.toLowerCase().includes('meal')
      ) as any;
    const mealType = mealTypeProperty?.select?.name || undefined;

    const difficultyProperty = properties['Difficulty'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'select' && prop.name?.toLowerCase().includes('difficulty')
      ) as any;
    const difficulty = difficultyProperty?.select?.name || undefined;

    const recipeBody = await fetchPageContent(page.id);

    return {
      name,
      emoji,
      tags,
      mealType,
      difficulty,
      recipeBody,
    };
  } catch (error) {
    console.error('Error mapping recipe:', error);
    return null;
  }
}

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function generateSQLInsertWithId(recipe: RecipeData, id: string): string {
  const now = Date.now();

  const name = escapeSQL(recipe.name);
  const emoji = recipe.emoji ? `'${escapeSQL(recipe.emoji)}'` : 'NULL';
  const tags = recipe.tags && recipe.tags.length > 0
    ? `'${escapeSQL(JSON.stringify(recipe.tags))}'`
    : 'NULL';
  const mealType = recipe.mealType ? `'${escapeSQL(recipe.mealType)}'` : 'NULL';
  const difficulty = recipe.difficulty ? `'${escapeSQL(recipe.difficulty)}'` : 'NULL';
  const recipeBody = recipe.recipeBody ? `'${escapeSQL(recipe.recipeBody)}'` : 'NULL';

  return `INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, lastMadeDate, mealsEatenCount, recipeBody, createdAt, updatedAt, updateCounter)
VALUES ('${id}', '${name}', ${emoji}, ${tags}, ${mealType}, ${difficulty}, NULL, 0, ${recipeBody}, ${now}, ${now}, 0);`;
}

async function main() {
  console.log('Starting Recipes scraper (via Food Schedule relations)...\n');

  // Get all unique recipe IDs from schedule
  const recipeIds = await getAllRecipeIdsFromSchedule();

  console.log('Step 2: Fetching each recipe page...\n');

  const recipes: Array<{ data: RecipeData; notionId: string }> = [];
  const recipeIdArray = Array.from(recipeIds);

  for (let i = 0; i < recipeIdArray.length; i++) {
    const recipeId = recipeIdArray[i];
    process.stdout.write(`\rProcessing recipe ${i + 1}/${recipeIdArray.length}...`);

    try {
      const page = await notion.pages.retrieve({ page_id: recipeId });
      const recipe = await mapNotionPageToRecipe(page);

      if (recipe) {
        recipes.push({
          data: recipe,
          notionId: recipeId,
        });
      }
    } catch (error: any) {
      console.error(`\nError fetching recipe ${recipeId}:`, error.message);
    }
  }

  console.log(`\n\nMapped ${recipes.length} valid recipes`);

  // Generate SQL
  const sqlStatements = [
    '-- Seed data for recipes table',
    '-- Generated from Notion (via Food Schedule relations)',
    `-- Date: ${new Date().toISOString()}`,
    '-- Note: Recipe IDs are Notion page IDs',
    '',
  ];

  for (const recipe of recipes) {
    sqlStatements.push(generateSQLInsertWithId(recipe.data, recipe.notionId));
  }

  const sql = sqlStatements.join('\n');

  const outputPath = './src/db/seed.sql';
  fs.writeFileSync(outputPath, sql, 'utf-8');

  console.log(`\n✅ Successfully generated ${outputPath}`);
  console.log(`   ${recipes.length} recipes inserted`);
  console.log(`   Using Notion page IDs as recipe IDs`);
}

main().catch(console.error);
