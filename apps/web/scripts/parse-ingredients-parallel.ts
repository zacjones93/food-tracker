#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ParsedRecipe {
  ingredients: string[];
  instructions: string;
}

interface RecipeData {
  index: number;
  fullInsert: string;
  id: string;
  mealsEatenCount: string;
  recipeBody: string;
  createdAt: string;
  updatedAt: string;
  updateCounter: string;
  beforeMealsEaten: string;
}

/**
 * Use Claude Haiku to parse recipe body into ingredients and instructions
 */
async function parseRecipeBody(recipeBody: string): Promise<ParsedRecipe> {
  if (!recipeBody || !recipeBody.trim()) {
    return { ingredients: [], instructions: '' };
  }

  const prompt = `Parse the following recipe content and separate it into ingredients and instructions.

Recipe content:
\`\`\`
${recipeBody}
\`\`\`

Return a JSON object with:
- "ingredients": array of ingredient strings (cleaned up, one per line)
- "instructions": remaining instructions/directions as a single string (empty string if none)

Return ONLY valid JSON, no other text.`;

  try {
    const result = execSync(`/Users/zacjones/.nvm/versions/node/v22.17.1/bin/claude --model haiku`, {
      input: prompt,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    // Strip markdown code blocks if present
    let jsonText = result.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    }

    const parsed = JSON.parse(jsonText);
    return {
      ingredients: parsed.ingredients || [],
      instructions: parsed.instructions || ''
    };
  } catch (error) {
    console.error('Error parsing recipe with Haiku:', error);
    // Fallback: treat everything as instructions
    return { ingredients: [], instructions: recipeBody };
  }
}

/**
 * Escape single quotes for SQL
 */
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Extract all recipe INSERTs from seed file
 */
function extractRecipes(inputPath: string): RecipeData[] {
  const content = readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');

  const recipes: RecipeData[] = [];
  let currentInsert = '';
  let insideInsert = false;
  let recipeIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('INSERT INTO recipes ')) {
      insideInsert = true;
      currentInsert = line;
      continue;
    }

    if (insideInsert) {
      currentInsert += '\n' + line;

      if (line.trim().endsWith(');')) {
        const valuesMatch = currentInsert.match(/VALUES \((.*)\);/s);
        if (valuesMatch) {
          const valuesStr = valuesMatch[1];
          const recipeBodyMatch = valuesStr.match(/, (\d+), '((?:[^']|'')*)', (\d+), (\d+), (\d+)$/s);

          if (recipeBodyMatch) {
            const mealsEatenCount = recipeBodyMatch[1];
            const recipeBody = recipeBodyMatch[2].replace(/''/g, "'");
            const createdAt = recipeBodyMatch[3];
            const updatedAt = recipeBodyMatch[4];
            const updateCounter = recipeBodyMatch[5];
            const beforeMealsEaten = valuesStr.substring(0, valuesStr.length - recipeBodyMatch[0].length + 2);

            // Extract ID for logging
            const idMatch = valuesStr.match(/^'([^']+)'/);
            const id = idMatch ? idMatch[1].substring(0, 12) : `recipe_${recipeIndex}`;

            recipes.push({
              index: recipeIndex++,
              fullInsert: currentInsert,
              id,
              mealsEatenCount,
              recipeBody,
              createdAt,
              updatedAt,
              updateCounter,
              beforeMealsEaten,
            });
          }
        }

        insideInsert = false;
        currentInsert = '';
      }
    }
  }

  return recipes;
}

/**
 * Process a batch of recipes and write to separate file
 */
async function processBatch(recipes: RecipeData[], batchNum: number, outputDir: string): Promise<void> {
  const results: string[] = [];
  let successCount = 0;

  console.log(`[Batch ${batchNum}] Processing ${recipes.length} recipes...`);

  for (const recipe of recipes) {
    const { ingredients, instructions } = await parseRecipeBody(recipe.recipeBody);

    if (ingredients.length > 0) {
      successCount++;
    }

    // Build new INSERT
    const ingredientsJson = JSON.stringify(ingredients);
    const instructionsEscaped = escapeSql(instructions);
    const ingredientsEscaped = escapeSql(ingredientsJson);

    const updatedInsert = recipe.fullInsert
      .replace(
        'INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, recipeBody,',
        'INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, ingredients, recipeBody,'
      );

    const newInsert = updatedInsert
      .replace(/VALUES \((.*)\);/s,
        `VALUES (${recipe.beforeMealsEaten}${recipe.mealsEatenCount}, '${ingredientsEscaped}', '${instructionsEscaped}', ${recipe.createdAt}, ${recipe.updatedAt}, ${recipe.updateCounter});`);

    results.push(newInsert);
  }

  // Write batch to its own file
  const batchFile = resolve(outputDir, `batch-${batchNum}.sql`);
  writeFileSync(batchFile, results.join('\n'), 'utf-8');

  console.log(`[Batch ${batchNum}] ✓ Completed. Extracted ingredients from ${successCount}/${recipes.length} recipes`);
}

/**
 * Write batch processing script for sub-agents
 */
function writeBatchScript(recipes: RecipeData[], batchNum: number, outputDir: string) {
  const scriptPath = resolve(outputDir, `batch-${batchNum}.json`);
  writeFileSync(scriptPath, JSON.stringify(recipes, null, 2), 'utf-8');
}

/**
 * Main execution - parallel batching
 */
async function main() {
  const inputPath = resolve(__dirname, '../src/db/seed.sql');
  const outputPath = resolve(__dirname, '../src/db/seed-with-ingredients.sql');
  const tempDir = resolve(__dirname, '../.temp-batches');

  // Create temp directory
  const { mkdirSync, existsSync, readdirSync, unlinkSync, rmdirSync } = await import('fs');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir);
  }

  console.log('Reading seed file...');
  const allRecipes = extractRecipes(inputPath);
  console.log(`Found ${allRecipes.length} recipes\n`);

  // Split into batches
  const BATCH_SIZE = 52; // ~10 batches for 514 recipes
  const batches: RecipeData[][] = [];

  for (let i = 0; i < allRecipes.length; i += BATCH_SIZE) {
    batches.push(allRecipes.slice(i, i + BATCH_SIZE));
  }

  console.log(`Split into ${batches.length} batches of ~${BATCH_SIZE} recipes each\n`);

  // Process batches in parallel
  console.log('Processing batches in parallel...\n');
  const batchPromises = batches.map((batch, idx) =>
    processBatch(batch, idx + 1, tempDir)
  );

  await Promise.all(batchPromises);

  console.log('\nCombining batch results...');

  // Read all batch files in order
  const allProcessedInserts: string[] = [];
  for (let i = 1; i <= batches.length; i++) {
    const batchFile = resolve(tempDir, `batch-${i}.sql`);
    const batchContent = readFileSync(batchFile, 'utf-8');
    const batchInserts = batchContent.split('\n').filter(line => line.trim());
    allProcessedInserts.push(...batchInserts);
  }

  // Read original file to get header and non-recipe content
  const originalContent = readFileSync(inputPath, 'utf-8');
  const lines = originalContent.split('\n');
  const outputLines: string[] = [];

  // Copy everything until first recipe INSERT
  for (const line of lines) {
    if (line.startsWith('INSERT INTO recipes ')) {
      break;
    }
    outputLines.push(line);
  }

  // Add processed recipes
  outputLines.push(...allProcessedInserts);

  // Write output
  console.log(`Writing results to: ${outputPath}`);
  writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

  // Clean up temp files
  console.log('Cleaning up temp files...');
  const files = readdirSync(tempDir);
  for (const file of files) {
    unlinkSync(resolve(tempDir, file));
  }
  rmdirSync(tempDir);

  console.log('\n=== SUMMARY ===');
  console.log(`Total recipes processed: ${allRecipes.length}`);
  console.log('Done!');
}

main();
