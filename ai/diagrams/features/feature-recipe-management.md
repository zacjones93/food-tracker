# Recipe Collection Management

**Type:** Feature Diagram
**Last Updated:** 2025-01-09
**Related Files:**
- `src/app/(dashboard)/recipes/page.tsx`
- `src/app/(dashboard)/recipes/[id]/page.tsx`
- `src/app/(dashboard)/recipes/recipes.actions.ts`
- `src/db/schema.ts` (recipes table)

## Purpose

Illustrates how users browse, search, filter, and manage their recipe collection of 570+ recipes. Shows the progression from viewing the collection to finding specific recipes using advanced filters and fuzzy search.

## Diagram

```mermaid
flowchart TB
    subgraph "Front-Stage: User Experience"
        User[👤 User]

        subgraph "Entry Point"
            RecipesPage["📚 /recipes<br/>Browse Collection"]
        end

        subgraph "Discovery Actions"
            Search["🔍 Fuzzy Search<br/>(by name)"]
            Filter["🎛️ Filter Panel<br/>Meal Type | Difficulty | Seasons<br/>Recipe Book | Times Eaten"]
            Sort["📊 Sort Options<br/>Newest | Most Eaten | Name"]
        end

        subgraph "Recipe Display"
            Table["📋 Recipes Table<br/>570+ recipes loaded client-side"]
            Card["🃏 Recipe Card<br/>Emoji | Name | Tags | Stats"]
        end

        subgraph "Detail View"
            Detail["📖 /recipes/[id]<br/>Full Recipe Detail"]
            Ingredients["📝 Ingredients List<br/>(grouped by section)"]
            Instructions["📋 Instructions<br/>(markdown supported)"]
            Relations["🔗 Related Recipes<br/>(sides/accompaniments)"]
        end

        subgraph "Actions"
            AddToWeek["➕ Add to Schedule"]
            AddIngredients["🛒 Add Ingredients to Week"]
            Edit["✏️ Edit Recipe"]
            Track["📊 Mark as Made<br/>(increment mealsEatenCount)"]
        end
    end

    subgraph "Back-Stage: Data Loading"
        ServerAction[🔧 getRecipesAction]
        Database[(💾 D1 Database<br/>recipes table)]

        subgraph "Query Optimization"
            TeamScope["🔒 Team Scoping<br/>WHERE teamId = user.activeTeamId"]
            Pagination["📄 Limit 10,000<br/>(client-side search)"]
            Relations2["🔗 Load Relations<br/>(week_recipes, recipe_relations)"]
        end

        subgraph "Client-Side Processing"
            Fuse["🔎 Fuse.js Fuzzy Search<br/>(instant results)"]
            ClientFilter["🎛️ Client-Side Filter<br/>(no server round-trip)"]
            URLState["🔗 NUQS URL State<br/>(shareable filter links)"]
        end
    end

    User -->|Visit recipes page| RecipesPage
    RecipesPage -->|Fetch all| ServerAction
    ServerAction -->|Query| TeamScope
    TeamScope -->|Filter| Database
    Database -->|Return 570+ recipes| ServerAction
    ServerAction -->|Load relations| Relations2
    ServerAction -->|Return data| Table

    Table -->|Render| Card
    Card -->|Display| User

    User -->|Type search query| Search
    Search -->|Instant filter| Fuse
    Fuse -->|Update display| Table

    User -->|Select filters| Filter
    Filter -->|Update URL| URLState
    URLState -->|Re-filter| ClientFilter
    ClientFilter -->|Update display| Table

    User -->|Choose sort| Sort
    Sort -->|Re-order| Table

    User -->|Click recipe card| Card
    Card -->|Navigate| Detail
    Detail -->|Load full data| Database
    Database -->|Return| Ingredients
    Database -->|Return| Instructions
    Database -->|Return| Relations

    User -->|View ingredients| Ingredients
    User -->|Read instructions| Instructions
    User -->|See sides| Relations

    User -->|Click action| AddToWeek
    User -->|Click action| AddIngredients
    User -->|Click action| Edit
    User -->|Click action| Track

    AddToWeek -->|Open dialog| Search
    AddIngredients -->|Bulk insert| Database
    Edit -->|Update recipe| Database
    Track -->|Increment counter| Database

    classDef userAction fill:#e1f5ff
    classDef dataLayer fill:#f0f0f0
    classDef clientOpt fill:#fff4e1

    class User,RecipesPage,Search,Filter,Sort,Table,Card,Detail,Ingredients,Instructions,Relations,AddToWeek,AddIngredients,Edit,Track userAction
    class ServerAction,Database,TeamScope,Pagination,Relations2 dataLayer
    class Fuse,ClientFilter,URLState clientOpt
```

## Key Insights

### User Value
- **Massive collection**: 570+ recipes loaded instantly without pagination lag
- **Instant search**: Fuzzy search with Fuse.js provides results as you type (no loading states)
- **Advanced filtering**: Meal type, difficulty, seasons, recipe book, and times eaten filters
- **Shareable filters**: URL state management means filter combinations can be bookmarked/shared
- **Visual browsing**: Emoji + tags on cards enable quick visual scanning
- **Tracking**: `mealsEatenCount` helps identify favorite recipes over time

### Performance Strategy
- **Client-side search**: Load all 10,000 recipes once, filter on client (faster than server pagination)
- **Server Components**: Initial page render happens on edge with zero client JS
- **Lazy image loading**: Recipe images (if added) use Next.js Image with automatic optimization
- **Debounced search**: Search input debounced to prevent excessive re-renders

### Data Schema
- **Recipes table fields**: id, name, emoji, tags (JSON array), mealType, difficulty, ingredients (JSON), recipeBody (markdown)
- **Tracking fields**: lastMadeDate, mealsEatenCount (updated when marked as made)
- **Relations**: recipeBookId → recipe_books.id, teamId → team.id
- **Visibility**: visibility field (public/private/unlisted) for future multi-tenant sharing

### Filter Combinations
- **Meal Type**: breakfast, lunch, dinner, snack, dessert, appetizer
- **Difficulty**: easy, medium, hard
- **Seasons**: winter, spring, summer, fall (JSON array in tags)
- **Recipe Book**: Filter by source cookbook (470+ books in database)
- **Times Eaten**: Range filter (e.g., 0-5, 5-10, 10+)

### Related Features
- **Recipe Relations**: Self-referencing many-to-many (Recipe → Recipe) for sides/accompaniments
- **Notion Import**: 570+ recipes imported from Notion database via scraper script
- **Team Scoping**: All recipes belong to a team, enabling future family sharing
- **Edit Inline**: Edit ingredients/instructions via dialog without page navigation

## Change History

- **2025-01-09:** Initial recipe management feature diagram showing collection browsing, filtering, and detail view
