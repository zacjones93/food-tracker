# Food Tracker Database Architecture

## Overview

Recreating the Notion Food page requires two primary databases with a many-to-many relationship, plus structured content within individual week pages.

## Database Schema

### 1. Recipes Database

**Purpose:** Store all recipe entries with metadata and tracking

**Properties:**
- `name` (title) - Recipe name
- `tags` (multi-select or relation) - Categorization
- `day` (date) - When recipe was last made or scheduled
- `meal` (select) - Meal type (Lunch, Dinner, Breakfast, etc.)
- `other_recipes` (relation) - Self-referencing relation to Recipes for side dishes/accompaniments
- `created_time` (created_time) - When recipe was added
- `meals_eaten` (number) - Usage counter (e.g., 61 times)
- `weeks` (relation) - Relation to Weeks database (reverse relation)
- Additional properties (6+ more based on "6 more properties" indicator):
  - Likely includes: ingredients list, cook time, difficulty, servings, etc.

**Content Structure:**
- Free-form ingredient lists and instructions in page body
- Example: "4 chicken thighs"

**Views:**
- All Recipes (default table view)
- Most popular meals (sorted by meals_eaten)
- This Next week (filtered by upcoming weeks)
- 5+ additional views

**Count:** 570 recipes in the observed system

---

### 2. Weeks / Food Schedule Database

**Purpose:** Plan weekly meal schedules and track status

**Properties:**
- `name` (title) - Week identifier (e.g., "Oct 14th - 19th, 2025")
- `weeks` (select/status) - Week status with values:
  - Current
  - Upcoming
  - No Weeks (or similar archived status)
- `week` (unclear type) - Observed as "Empty", possibly number or relation
- `our_recipes` (relation) - Many-to-many relation to Recipes database

**Content Structure:**
Each week page contains a manually maintained grocery list organized by categories:

```markdown
## Meat
- [ ] eggs
- [ ] bacon - 2x

## Veggies / Herbs
- [ ] bananas
- [ ] dill
- [ ] parsley
- [ ] cilantro
- [ ] sage
- [ ] green onions
- [ ] butternut squash
- [ ] garlic
- [ ] shallots - 3x
```

**Views:**
- Board (grouped by `weeks` status) - Primary view
- Default view (likely table)
- Pat weeks (custom view)

---

## Relationships

### Many-to-Many: Weeks ↔ Recipes

- **Direction 1:** `Weeks.our_recipes` → Multiple Recipes
- **Direction 2:** `Recipes.weeks` → Multiple Weeks (implied reverse relation)
- **Example:** "Cracklin Chicken" appears in both "Oct 14th - 19th, 2025" and "Oct 20th - 26th, 2025"

### Self-Referencing: Recipe → Recipe

- **Property:** `Recipes.other_recipes`
- **Purpose:** Link main dishes to sides (e.g., "Cracklin Chicken" → "Salt & Vinegar Potatoes")
- **Type:** Many-to-many (a recipe can have multiple sides, a side can pair with multiple mains)

---

## Key Features to Implement

### 1. Board View for Weeks
- Group by `weeks` status field
- Display recipe count and recipe links in each card
- Swimlanes: Current (2), Upcoming (0), No Weeks

### 2. Week Page Grocery Lists
- **Manual Entry:** Grocery lists appear to be manually maintained checklists
- **Categories:** Organized by food type (Meat, Veggies/Herbs, etc.)
- **Quantities:** Track quantities (e.g., "bacon - 2x", "shallots - 3x")
- **Not Automated:** Based on observation, grocery lists are NOT automatically aggregated from recipe ingredients

### 3. Recipe Tracking
- Usage counter (`meals_eaten`) increments each time recipe is made
- Creation timestamp for historical reference
- Metadata for filtering/sorting (meal type, tags)

### 4. Multiple Database Views
- Recipes need diverse views for different use cases:
  - Popularity ranking (Most popular meals)
  - Current schedule (This Next week)
  - Complete catalog (All Recipes)

---

## Implementation Considerations

### Required Database Features
1. **Relation Fields:** Many-to-many bidirectional relations
2. **Select/Status Fields:** Single-select with defined options
3. **Formula/Rollup Fields:** Likely used for aggregating recipe data in week views
4. **Board Views:** Kanban-style grouping by select field
5. **Rich Text Content:** Markdown-style formatted content in page bodies

### Data Entry Workflow
1. Create recipes in Recipes database
2. Create week entries in Weeks database
3. Link recipes to weeks via `our_recipes` relation
4. Manually populate grocery list on week page by reviewing linked recipes
5. Update `meals_eaten` counter when recipe is prepared

### Potential Enhancements
- Automated grocery list generation from recipe ingredients
- Ingredient normalization/deduplication
- Quantity aggregation across multiple recipes
- Shopping list export functionality
- Recipe difficulty/rating fields
- Nutritional information tracking

---

## Minimum Viable Schema

To recreate core functionality:

**Recipes:**
- name (title)
- meal (select)
- weeks (relation to Weeks)
- other_recipes (relation to Recipes)
- meals_eaten (number)
- created_time (created_time)

**Weeks:**
- name (title)
- weeks (select: Current, Upcoming, No Weeks)
- our_recipes (relation to Recipes)
- [Page content: Grocery checklist in markdown]

**Views:**
- Weeks: Board view grouped by `weeks` status
- Recipes: Table view with filters for current week, popularity

This minimal schema captures the essential relationships and workflows observed in the Notion page.
