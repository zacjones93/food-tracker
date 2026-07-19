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
    console.error(`  ⚠ Parse error, using fallback`);
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
 * Main execution - sequential processing with progress
 */
async function main() {
  const inputPath = resolve(__dirname, '../src/db/seed.sql');
  const outputPath = resolve(__dirname, '../src/db/seed-with-ingredients.sql');

  console.log('Reading seed file...');
  const content = readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');

  const outputLines: string[] = [];
  let currentInsert = '';
  let insideInsert = false;
  let recipeCount = 0;
  let ingredientsExtracted = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is a recipe INSERT statement (not recipe_books)
    if (line.startsWith('INSERT INTO recipes ')) {
      insideInsert = true;
      currentInsert = line;
      continue;
    }

    // If we're inside an insert, accumulate lines
    if (insideInsert) {
      currentInsert += '\n' + line;

      // Check if insert is complete (ends with ;)
      if (line.trim().endsWith(');')) {
        recipeCount++;

        // Parse the INSERT statement
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

            // Progress indicator
            process.stdout.write(`\rProcessing ${recipeCount}...`);

            // Parse ingredients using Haiku
            const { ingredients, instructions } = await parseRecipeBody(recipeBody);

            if (ingredients.length > 0) {
              ingredientsExtracted++;
            }

            // Build new INSERT with ingredients column
            const ingredientsJson = JSON.stringify(ingredients);
            const instructionsEscaped = escapeSql(instructions);
            const ingredientsEscaped = escapeSql(ingredientsJson);

            // Update the column list to include 'ingredients'
            const updatedInsert = currentInsert
              .replace(
                'INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, recipeBody,',
                'INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, ingredients, recipeBody,'
              );

            // Replace the old values with new ones that include ingredients
            const beforeMealsEaten = valuesStr.substring(0, valuesStr.length - recipeBodyMatch[0].length + 2);

            const newInsert = updatedInsert
              .replace(/VALUES \((.*)\);/s,
                `VALUES (${beforeMealsEaten}${mealsEatenCount}, '${ingredientsEscaped}', '${instructionsEscaped}', ${createdAt}, ${updatedAt}, ${updateCounter});`);

            outputLines.push(newInsert);
          } else {
            outputLines.push(currentInsert);
          }
        } else {
          outputLines.push(currentInsert);
        }

        insideInsert = false;
        currentInsert = '';
      }
    } else {
      // Not a recipe insert, just copy the line
      outputLines.push(line);
    }
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Processed ${recipeCount} recipes`);
  console.log(`Extracted ingredients from ${ingredientsExtracted} recipes`);

  // Write output
  console.log(`\nWriting to: ${outputPath}`);
  writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');
  console.log('Done!');
}

main();
