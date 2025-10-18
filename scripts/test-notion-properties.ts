import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config({ path: '.env.local' });

if (!process.env.NOTION_API_KEY) {
  throw new Error('NOTION_API_KEY environment variable is required');
}

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

async function testRecipeProperties() {
  console.log('Testing recipe property access...\n');

  // Get first recipe from schedule to test
  const SCHEDULE_DB_ID = '28fde7a2-c4fc-81a7-93d8-000b6ab25051';

  const scheduleResponse = await notion.dataSources.query({
    data_source_id: SCHEDULE_DB_ID,
    page_size: 1,
  });

  const schedulePageData = scheduleResponse.results[0] as any;

  // Get first recipe relation
  const relationProps = Object.entries(schedulePageData.properties)
    .filter(([_, prop]: [string, any]) => prop.type === 'relation');

  let recipeId: string | null = null;
  for (const [_, prop] of relationProps) {
    const relations = (prop as any).relation || [];
    if (relations.length > 0) {
      recipeId = relations[0].id;
      break;
    }
  }

  if (!recipeId) {
    console.log('No recipe found in schedule');
    return;
  }

  console.log(`Testing with recipe ID: ${recipeId}\n`);

  // Fetch the recipe page
  const page = await notion.pages.retrieve({ page_id: recipeId });
  const properties = (page as any).properties;

  console.log('=== All Properties ===');
  for (const [key, prop] of Object.entries(properties)) {
    const propData = prop as any;
    console.log(`\n"${key}"`);
    console.log(`  Type: ${propData.type}`);

    if (propData.type === 'title') {
      console.log(`  Value: ${propData.title?.[0]?.plain_text || 'N/A'}`);
    } else if (propData.type === 'select') {
      console.log(`  Value: ${propData.select?.name || 'N/A'}`);
    } else if (propData.type === 'multi_select') {
      console.log(`  Value: ${propData.multi_select?.map((t: any) => t.name).join(', ') || 'N/A'}`);
    } else if (propData.type === 'url') {
      console.log(`  Value: ${propData.url || 'N/A'}`);
    } else if (propData.type === 'rich_text') {
      console.log(`  Value: ${propData.rich_text?.[0]?.plain_text || 'N/A'}`);
    } else if (propData.type === 'number') {
      console.log(`  Value: ${propData.number || 'N/A'}`);
    } else if (propData.type === 'relation') {
      console.log(`  Relations: ${propData.relation?.length || 0}`);
    }
  }

  console.log('\n\n=== Property Access Test ===');

  // Test finding recipe link
  console.log('\nSearching for Recipe Link property:');
  const recipeLinkProp = properties['Recipe link'] || properties['Link'];
  console.log(`  Direct access 'Recipe link': ${recipeLinkProp ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`  Direct access 'Link': ${properties['Link'] ? 'FOUND' : 'NOT FOUND'}`);

  const urlProps = Object.entries(properties).filter(([_, p]: [string, any]) => p.type === 'url');
  console.log(`  URL properties found: ${urlProps.length}`);
  urlProps.forEach(([key, prop]: [string, any]) => {
    console.log(`    - "${key}": ${prop.url || 'NULL'}`);
  });

  // Test finding recipe book
  console.log('\nSearching for Recipe Book property:');
  const recipeBookProp = properties['Recipe book'] || properties['Book'];
  console.log(`  Direct access 'Recipe book': ${recipeBookProp ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`  Direct access 'Book': ${properties['Book'] ? 'FOUND' : 'NOT FOUND'}`);

  const selectProps = Object.entries(properties).filter(([_, p]: [string, any]) => p.type === 'select');
  console.log(`  Select properties found: ${selectProps.length}`);
  selectProps.forEach(([key, prop]: [string, any]) => {
    console.log(`    - "${key}": ${(prop as any).select?.name || 'NULL'}`);
  });

  // Test finding page
  console.log('\nSearching for Page property:');
  const pageProp = properties['Page'];
  console.log(`  Direct access 'Page': ${pageProp ? 'FOUND' : 'NOT FOUND'}`);

  const textProps = Object.entries(properties).filter(([_, p]: [string, any]) => p.type === 'rich_text');
  console.log(`  Rich text properties found: ${textProps.length}`);
  textProps.forEach(([key, prop]: [string, any]) => {
    console.log(`    - "${key}": ${(prop as any).rich_text?.[0]?.plain_text || 'NULL'}`);
  });

  const numberProps = Object.entries(properties).filter(([_, p]: [string, any]) => p.type === 'number');
  console.log(`  Number properties found: ${numberProps.length}`);
  numberProps.forEach(([key, prop]: [string, any]) => {
    console.log(`    - "${key}": ${(prop as any).number || 'NULL'}`);
  });
}

testRecipeProperties().catch(console.error);
