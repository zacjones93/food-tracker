import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { createId } from '@paralleldrive/cuid2';
import * as fs from 'fs';

// Load .env.local file
dotenv.config({ path: '.env.local' });

if (!process.env.NOTION_API_KEY) {
  throw new Error('NOTION_API_KEY environment variable is required');
}

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Initialize Notion to Markdown converter
const n2m = new NotionToMarkdown({ notionClient: notion });

interface GroceryItem {
  name: string;
  checked: boolean;
  category?: string;
}

interface WeekData {
  name: string;
  emoji?: string;
  status: 'current' | 'upcoming' | 'archived';
  startDate?: Date;
  endDate?: Date;
  weekNumber?: number;
  recipeIds: string[]; // Recipe IDs linked to this week
  groceryItems: GroceryItem[];
}

interface WeekRecipeRelation {
  weekId: string;
  recipeId: string;
  order: number;
}

async function findScheduleDatabase() {
  try {
    console.log('Searching for Food Schedule database...');

    // Try to find Food Schedule as a standalone database first (it appears to be one)
    const searchResponse = await notion.search({
      filter: {
        property: 'object',
        value: 'data_source',
      },
    });

    const scheduleDb = searchResponse.results.find((db: any) => {
      const title = db.title?.[0]?.plain_text || '';
      return title.toLowerCase() === 'food schedule';
    });

    if (!scheduleDb) {
      console.error('Available databases:', searchResponse.results.map((db: any) => ({
        id: db.id,
        title: db.title?.[0]?.plain_text || 'Untitled'
      })));
      throw new Error('Food Schedule database not found. Please ensure the "Food Schedule" database is shared with your integration.');
    }

    console.log('Using Food Schedule database:', {
      id: scheduleDb.id,
      title: (scheduleDb as any).title?.[0]?.plain_text || 'Untitled'
    });

    return scheduleDb.id;
  } catch (error: any) {
    console.error('Error:', error.message || error);
    throw error;
  }
}

async function fetchSchedulePages(databaseId: string) {
  try {
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

      if (hasMore) {
        console.log(`Fetched ${allResults.length} schedule pages so far...`);
      }
    }

    return allResults;
  } catch (error: any) {
    console.error('Error fetching schedule pages:', error.message || error);
    throw error;
  }
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

function parseGroceryList(markdown: string): GroceryItem[] {
  const items: GroceryItem[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    // Match markdown checkboxes: - [ ] item or - [x] item
    const checkboxMatch = line.match(/^[\s-]*\[([x\s])\]\s*(.+)$/i);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      const name = checkboxMatch[2].trim();
      if (name) {
        items.push({ name, checked });
      }
    }
  }

  return items;
}

async function mapNotionPageToWeek(page: any): Promise<WeekData | null> {
  try {
    const properties = page.properties;

    // Extract name (title property)
    const nameProperty = Object.values(properties).find(
      (prop: any) => prop.type === 'title'
    ) as any;
    const name = nameProperty?.title?.[0]?.plain_text;

    if (!name) {
      console.warn('Skipping week without name:', page.id);
      return null;
    }

    // Extract emoji
    const emoji = page.icon?.emoji || undefined;

    // Extract status from "weeks" property
    const statusProperty = properties['weeks'] || properties['Weeks'] || properties['Status'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'select' &&
          (prop.name?.toLowerCase() === 'weeks' || prop.name?.toLowerCase().includes('status'))
      ) as any;

    let status: 'current' | 'upcoming' | 'archived' = 'archived';
    const statusValue = statusProperty?.select?.name?.toLowerCase();

    if (statusValue === 'current' || statusValue === 'current week') {
      status = 'current';
    } else if (statusValue === 'upcoming' || statusValue === 'future') {
      status = 'upcoming';
    } else if (statusValue === 'archived' || statusValue === 'past') {
      status = 'archived';
    }

    // Extract dates
    const startDateProperty = properties['Start Date'] || properties['Start'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'date' && prop.name?.toLowerCase().includes('start')
      ) as any;
    const startDate = startDateProperty?.date?.start ? new Date(startDateProperty.date.start) : undefined;

    const endDateProperty = properties['End Date'] || properties['End'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'date' && prop.name?.toLowerCase().includes('end')
      ) as any;
    const endDate = endDateProperty?.date?.end || endDateProperty?.date?.start
      ? new Date(endDateProperty?.date?.end || endDateProperty?.date?.start)
      : undefined;

    // Extract week number
    const weekNumberProperty = properties['Week Number'] || properties['Week #'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'number' && prop.name?.toLowerCase().includes('week')
      ) as any;
    const weekNumber = weekNumberProperty?.number || undefined;

    // Extract linked recipes (relation property)
    const recipesProperty = properties['Our Recipes'] || properties['Recipes'] || properties['Recipe'] ||
      Object.values(properties).find(
        (prop: any) => prop.type === 'relation' &&
          (prop.name?.toLowerCase().includes('recipe') || prop.name?.toLowerCase().includes('meal'))
      ) as any;

    const recipeIds = recipesProperty?.relation?.map((rel: any) => rel.id) || [];

    // Debug: log if we found recipes
    if (recipeIds.length > 0) {
      console.log(`\n  Found ${recipeIds.length} recipes for week: ${name}`);
    } else {
      // Debug: log available relation properties to help diagnose
      const relationProps = Object.entries(properties)
        .filter(([_, prop]: [string, any]) => prop.type === 'relation')
        .map(([key, prop]: [string, any]) => key);
      if (relationProps.length > 0) {
        console.log(`\n  No recipes found for "${name}". Available relation properties: ${relationProps.join(', ')}`);
      }
    }

    // Fetch page content to get grocery list
    const pageContent = await fetchPageContent(page.id);
    const groceryItems = pageContent ? parseGroceryList(pageContent) : [];

    return {
      name,
      emoji,
      status,
      startDate,
      endDate,
      weekNumber,
      recipeIds,
      groceryItems,
    };
  } catch (error) {
    console.error('Error mapping week page:', error);
    return null;
  }
}

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function generateWeekInsert(week: WeekData, weekId: string): string {
  const now = Date.now();
  const name = escapeSQL(week.name);
  const emoji = week.emoji ? `'${escapeSQL(week.emoji)}'` : 'NULL';
  const status = `'${week.status}'`;
  const startDate = week.startDate ? week.startDate.getTime() : 'NULL';
  const endDate = week.endDate ? week.endDate.getTime() : 'NULL';
  const weekNumber = week.weekNumber !== undefined ? week.weekNumber : 'NULL';

  return `INSERT INTO weeks (id, name, emoji, status, startDate, endDate, weekNumber, createdAt, updatedAt, updateCounter)
VALUES ('${weekId}', '${name}', ${emoji}, ${status}, ${startDate}, ${endDate}, ${weekNumber}, ${now}, ${now}, 0);`;
}

function generateWeekRecipeInserts(weekId: string, recipeIds: string[]): string[] {
  const now = Date.now();
  return recipeIds.map((recipeId, index) => {
    const id = `wr_${createId()}`;
    return `INSERT INTO week_recipes (id, weekId, recipeId, "order", createdAt)
VALUES ('${id}', '${weekId}', '${recipeId}', ${index}, ${now});`;
  });
}

function generateGroceryItemInserts(weekId: string, items: GroceryItem[]): string[] {
  const now = Date.now();
  return items.map((item, index) => {
    const id = `gi_${createId()}`;
    const name = escapeSQL(item.name);
    const checked = item.checked ? 1 : 0;
    const category = item.category ? `'${escapeSQL(item.category)}'` : 'NULL';
    return `INSERT INTO grocery_items (id, weekId, name, checked, "order", category, createdAt, updatedAt)
VALUES ('${id}', '${weekId}', '${name}', ${checked}, ${index}, ${category}, ${now}, ${now});`;
  });
}

async function main() {
  console.log('Starting Food Schedule scraper...\n');

  // Find the schedule database
  const scheduleDatabaseId = await findScheduleDatabase();

  // Fetch all schedule pages
  const pages = await fetchSchedulePages(scheduleDatabaseId);
  console.log(`Found ${pages.length} schedule pages\n`);

  console.log('Processing schedule pages...');
  const weeks: Array<{ data: WeekData; id: string }> = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    process.stdout.write(`\rProcessing schedule ${i + 1}/${pages.length}...`);

    const weekData = await mapNotionPageToWeek(page);
    if (weekData) {
      // Use Notion page ID directly as week ID
      const weekId = page.id;
      weeks.push({ data: weekData, id: weekId });
    }
  }

  console.log(`\n\nMapped ${weeks.length} valid weeks`);

  // Generate SQL
  const sqlStatements = [
    '-- Seed data for weeks and week_recipes tables',
    '-- Generated from Notion Food Schedule database',
    `-- Date: ${new Date().toISOString()}`,
    '',
    '-- Insert weeks',
    '',
  ];

  // Insert all weeks
  for (const week of weeks) {
    sqlStatements.push(generateWeekInsert(week.data, week.id));
  }

  sqlStatements.push('');
  sqlStatements.push('-- Insert week-recipe relationships');
  sqlStatements.push('-- Note: Recipe IDs are Notion page IDs');
  sqlStatements.push('');

  // Insert all week-recipe relationships
  // Recipe IDs from Notion are used directly as foreign keys
  for (const week of weeks) {
    if (week.data.recipeIds.length > 0) {
      const inserts = generateWeekRecipeInserts(week.id, week.data.recipeIds);
      sqlStatements.push(...inserts);
    }
  }

  sqlStatements.push('');
  sqlStatements.push('-- Insert grocery items');
  sqlStatements.push('');

  // Insert all grocery items
  for (const week of weeks) {
    if (week.data.groceryItems.length > 0) {
      const inserts = generateGroceryItemInserts(week.id, week.data.groceryItems);
      sqlStatements.push(...inserts);
    }
  }

  const sql = sqlStatements.join('\n');

  // Write to file
  const outputPath = './src/db/weeks-seed.sql';
  fs.writeFileSync(outputPath, sql, 'utf-8');

  // Count recipe relations
  const totalRecipeRelations = weeks.reduce((sum, week) => sum + week.data.recipeIds.length, 0);

  console.log(`\n✅ Successfully generated ${outputPath}`);
  console.log(`   ${weeks.length} weeks inserted`);
  console.log(`   ${totalRecipeRelations} week-recipe relationships inserted`);
  console.log(`   ${weeks.reduce((sum, w) => sum + w.data.groceryItems.length, 0)} grocery items inserted`);
  console.log(`   Using Notion page IDs for recipe foreign keys`);
}

main().catch(console.error);
