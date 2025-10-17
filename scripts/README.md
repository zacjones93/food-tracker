# Notion Scrapers

Scripts to scrape data from your Notion databases and generate seed SQL files.

## Recipe Scraper

Scrapes recipes from your Notion database and generates a `seed.sql` file for seeding the recipes table.

## Food Schedule Scraper

Scrapes food schedules/weeks from your Notion database and generates a `weeks-seed.sql` file for seeding the weeks and week_recipes tables.

## Setup

### 1. Get your Notion API key

- Go to https://www.notion.so/my-integrations
- Create a new integration (give it a name like "Food Tracker")
- Copy the "Internal Integration Token"

### 2. Share your database with the integration

**This is critical!** Without this step, you'll get a 404 error.

- Open your Notion database: https://egghead.notion.site/2af823d796eb43c7901a9be2ef6047ff
- Click the **"..."** menu in the top right corner of the page
- Select **"Add connections"** or **"Connect to"**
- Find and select your integration (the one you created in step 1)
- Confirm the connection

### 3. Set environment variable

```bash
export NOTION_API_KEY="your_integration_token_here"
```

Or add to `.env.local`:
```
NOTION_API_KEY=your_integration_token_here
```

## Usage

### Scrape Recipes

```bash
pnpm scrape:recipes
```

This will:
1. Fetch all recipes from your Notion "Recipes" database
2. Map the properties to match the recipe schema
3. Fetch full page content (markdown) for each recipe
4. Generate `src/db/seed.sql` with INSERT statements

### Scrape Food Schedules

```bash
pnpm scrape:schedule
```

This will:
1. Fetch all weeks/schedules from your Notion "Food Schedule" database
2. Map the properties to match the week schema
3. Extract linked recipes for each week
4. Generate `src/db/weeks-seed.sql` with INSERT statements for weeks and week_recipes tables

## Property Mapping

### Recipe Properties

- **Name**: From the title property
- **Emoji**: From the page icon
- **Tags**: From multi_select property
- **Meal Type**: From "Meal Type" or "Type" select property
- **Difficulty**: From "Difficulty" select property
- **Recipe Body**: Full page content converted to markdown

### Week/Schedule Properties

- **Name**: From the title property
- **Emoji**: From the page icon
- **Status**: From "Status" select property (current/upcoming/archived)
- **Start Date**: From "Start Date" or "Start" date property
- **End Date**: From "End Date" or "End" date property
- **Week Number**: From "Week Number" or "Week #" number property
- **Recipes**: From relation property linking to recipes

## Running the Seed

After generating the seed files, you can apply them to your database:

### Load Recipes

```bash
# For local development
pnpm db:seed:local

# For remote/production
pnpm db:seed:remote
```

### Load Weeks/Schedules

```bash
# For local development
pnpm db:seed:weeks:local

# For remote/production
pnpm db:seed:weeks:remote
```

**Note**: Load recipes first before loading weeks, since weeks reference recipe IDs.
