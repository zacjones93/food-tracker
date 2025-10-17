# Notion Database Setup Documentation

## Problem Discovery

The Food Tracker Notion workspace has multiple databases, and the scrapers were accessing the wrong ones, causing week-recipe relations to fail.

## Database Structure

### Actual Notion Setup

The Food page (`28fde7a2-c4fc-8174-bac2-fb1d171ef6de`) contains:

1. **Food Schedule** (standalone database)
   - ID: `28fde7a2-c4fc-81a7-93d8-000b6ab25051`
   - Type: Standalone database (queryable via `dataSources.query`)
   - Contains: 202 weeks with status tracking

2. **Recipes** (child/embedded database)
   - ID: `28fde7a2-c4fc-8181-80e1-db92f68b6898`
   - Type: Child database embedded in Food page
   - Contains: 514 recipes (the SOURCE OF TRUTH)
   - **CRITICAL**: Not directly queryable via `dataSources.query`
   - Week relations point to recipes in THIS database

3. **Recipes** (standalone database) - WRONG ONE
   - ID: `28fde7a2-c4fc-815c-b280-000b08e7bb9c`
   - Contains different recipes, not linked to weeks
   - Should NOT be used

4. **Herbal Recipes** (standalone database)
   - ID: `28fde7a2-c4fc-8190-bbf9-000b3d6f3e2a`
   - Subset of recipes
   - Should NOT be used

## Solution

Since the embedded "Recipes" database can't be queried directly, we use a workaround:

### Recipe Scraping Strategy

1. Query the Food Schedule database to get all weeks
2. Extract all unique recipe IDs from week relations
3. Fetch each recipe individually using `notion.pages.retrieve()`

This approach:
- ✅ Gets all 514 recipes that are actually used in weeks
- ✅ Uses correct Notion page IDs as foreign keys
- ✅ Ensures week-recipe relations will work correctly

### Scripts

**`scripts/scrape-notion-recipes.ts`**
```typescript
// Extracts unique recipe IDs from Food Schedule weeks
// Then fetches each recipe individually
// Generates: src/db/seed.sql
```

**`scripts/scrape-notion-schedule.ts`**
```typescript
// Queries Food Schedule database directly
// Extracts week data, recipe relations, and grocery items
// Generates: src/db/weeks-seed.sql
```

## Database IDs Reference

```typescript
const FOOD_PAGE_ID = '28fde7a2-c4fc-8174-bac2-fb1d171ef6de';
const FOOD_SCHEDULE_DB = '28fde7a2-c4fc-81a7-93d8-000b6ab25051'; // ✓ USE THIS
const RECIPES_CHILD_DB = '28fde7a2-c4fc-8181-80e1-db92f68b6898'; // ✓ Recipes live here
```

## Generated Seed Files

**`src/db/seed.sql`**
- 514 recipes
- Recipe IDs are Notion page IDs from the embedded database

**`src/db/weeks-seed.sql`**
- 202 weeks
- 1539 week-recipe relationships
- 5690 grocery items
- Recipe foreign keys match IDs in seed.sql ✅

## Key Learnings

1. **Child databases** (embedded in pages) cannot be queried via `dataSources.query()`
2. Must use `notion.pages.retrieve()` for individual pages from child databases
3. Notion API `search()` doesn't return child database pages reliably
4. The embedded database is the source of truth for recipes linked to weeks
5. Standalone databases with similar names can be misleading

## Verification

To verify the setup is correct:

```bash
# Check recipe IDs in week relations exist in recipes
grep "VALUES.*wr_" src/db/weeks-seed.sql | head -5
# Copy a recipe ID and verify it exists in seed.sql
grep "<recipe-id>" src/db/seed.sql
```

## Usage

```bash
# Scrape recipes (via Food Schedule relations)
pnpm scrape:recipes

# Scrape weeks, relations, and grocery items
pnpm tsx scripts/scrape-notion-schedule.ts
```
