# AI Chat Feature Implementation Plan

**Project**: Food Tracker - AI Cooking Assistant
**Created**: October 2025
**Estimated Time**: 12-16 hours
**Access Control**: Restricted to `team_default` only

---

## Overview

Add an AI-powered chat assistant accessible from the sidebar navigation. The feature will be locked to the `team_default` team only, with all other teams seeing a blocked message. Includes full usage tracking, cost monitoring, and permission-based access control.

**Model Choice**: Google Gemini 2.5 Flash
- Fast streaming responses
- Strong tool calling capabilities
- 1M token context window
- Actual model used: gemini-2.5-flash (not Flash Lite)

---

## Implementation Status

All phases complete! Implementation commits:

1. **c61f582** - Phase 1.1-1.3: Add AI schema (aiUsage table, AI permissions, team settings)
2. **8ae2b2a** - Phase 1.4-1.5: Add AI migration and enable for team_default
3. **6102f27** - Phase 2: Install AI SDK dependencies
4. **e5b3fb4** - Phase 3: Create AI access control utilities
5. **24b3671** - Phase 4: Create AI tools library with updated pricing
6. **586ec46** - Phase 5: Create API chat route handler
7. **6592344** - Phase 6: Create chat UI components
8. **d6e5168** - Phase 7: Add AI Assistant to navigation

---

## Phase 1: Database Schema Updates

### 1.1 Add AI Usage Tracking Table

**File**: `food-tracker/src/db/schema.ts`

```typescript
// Add after existing tables
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    ...commonColumns,
    id: text().primaryKey().$defaultFn(() => createId("aiu")),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    model: text().notNull(), // e.g., "claude-3-5-sonnet-20241022"
    endpoint: text().notNull(), // e.g., "/api/chat"
    promptTokens: integer().notNull(),
    completionTokens: integer().notNull(),
    totalTokens: integer().notNull(),
    estimatedCostUsd: real().notNull(),
    conversationId: text(), // Optional: track multi-turn conversations
    finishReason: text(), // e.g., "stop", "length", "tool_calls"
  },
  (table) => [
    index("ai_usage_user_idx").on(table.userId),
    index("ai_usage_team_idx").on(table.teamId),
    index("ai_usage_created_idx").on(table.createdAt),
  ]
);

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  user: one(user, {
    fields: [aiUsage.userId],
    references: [user.id],
  }),
  team: one(team, {
    fields: [aiUsage.teamId],
    references: [team.id],
  }),
}));
```

### 1.2 Add AI Permissions to Team Roles

**File**: `food-tracker/src/db/schema.ts`

Update the permissions constants to include AI access:

```typescript
// Add to existing permission constants
export const AI_PERMISSIONS = {
  USE_AI_ASSISTANT: "ai:use_assistant",
  VIEW_AI_USAGE: "ai:view_usage",
  MANAGE_AI_SETTINGS: "ai:manage_settings",
} as const;

// Update PERMISSIONS object
export const PERMISSIONS = {
  ...RECIPE_PERMISSIONS,
  ...SCHEDULE_PERMISSIONS,
  ...GROCERY_PERMISSIONS,
  ...TEAM_PERMISSIONS,
  ...AI_PERMISSIONS, // Add this
} as const;
```

### 1.3 Update Team Settings Schema

**File**: `food-tracker/src/db/schema.ts`

Add AI feature flags to team settings:

```typescript
export const teamSettings = sqliteTable("team_settings", {
  // ... existing fields

  // AI Features (add these)
  aiEnabled: integer({ mode: "boolean" }).notNull().default(false),
  aiMonthlyBudgetUsd: real().default(10.0), // $10/month default
  aiMaxTokensPerRequest: integer().default(4000),
  aiMaxRequestsPerDay: integer().default(100),
});
```

### 1.4 Generate and Run Migration

```bash
cd food-tracker
pnpm db:generate add-ai-chat-feature
pnpm db:migrate:local

# Verify migration
wrangler d1 migrations list $(node scripts/get-db-name.mjs) --local
```

### 1.5 Enable AI for team_default

Create a migration or manual SQL update:

```sql
-- Enable AI for team_default
UPDATE team_settings
SET aiEnabled = 1, aiMonthlyBudgetUsd = 50.0
WHERE teamId = (SELECT id FROM team WHERE slug = 'team_default');
```

**Task Checklist**:
- [ ] Add `aiUsage` table to schema
- [ ] Add AI permissions constants
- [ ] Update `teamSettings` with AI flags (don't let teams enable AI for now / disable the setting)
- [ ] Generate migration
- [ ] Run migration locally
- [ ] Enable AI for `team_default` team
- [ ] Test schema with sample query

---

## Phase 2: Install Dependencies & Configure Secrets

### 2.1 Install AI SDK Packages

```bash
cd food-tracker

# Core AI SDK
pnpm add ai @ai-sdk/google

# Upgrade Zod for subpath support (v3 + v4)
pnpm add zod@^3.25.76

# Optional: OpenAI/Anthropic for comparison
# pnpm add @ai-sdk/openai @ai-sdk/anthropic
```

### 2.2 Configure Local Secrets

**File**: `food-tracker/.dev.vars` (gitignored)

```bash
# Add Google AI API key for local development
# Get your key from: https://aistudio.google.com/app/apikey
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

### 2.3 Configure Production Secrets

```bash
# Deploy secret to Cloudflare Workers
wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
# Paste: AIza...
```

### 2.4 Update Cloudflare Types

**Optional**: Add Workers AI binding to `wrangler.jsonc`:

```jsonc
{
  "name": "cloudflare-workers-nextjs-saas",
  "vars": {
    "ENVIRONMENT": "production"
  },
  "ai": {
    "binding": "AI"  // Optional: for Workers AI
  }
}
```

Then regenerate types:

```bash
pnpm cf-typegen
```

**Task Checklist**:
- [ ] Install AI SDK packages (`ai` and `@ai-sdk/google`)
- [ ] Upgrade Zod to ^3.25.76
- [ ] Get Google AI API key from https://aistudio.google.com/app/apikey
- [ ] Add `GOOGLE_GENERATIVE_AI_API_KEY` to `.dev.vars`
- [ ] Deploy secret via `wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY`
- [ ] Update `wrangler.jsonc` (if using Workers AI)
- [ ] Run `pnpm cf-typegen`
- [ ] Verify Zod dual imports work

---

## Phase 3: Team Access Control & Permissions

### 3.1 Create AI Access Control Utility

**File**: `food-tracker/src/lib/ai/access-control.ts`

```typescript
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { team, teamSettings } from "@/db/schema";

const ALLOWED_TEAM_SLUG = "team_default";

export async function checkAiAccess(teamId: string): Promise<{
  allowed: boolean;
  reason?: string;
  settings?: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
}> {
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Get team details
  const teamData = await db.query.team.findFirst({
    where: eq(team.id, teamId),
    with: {
      settings: true,
    },
  });

  if (!teamData) {
    return { allowed: false, reason: "Team not found" };
  }

  // Check if team is allowed (slug-based restriction)
  if (teamData.slug !== ALLOWED_TEAM_SLUG) {
    return {
      allowed: false,
      reason: "This feature is currently restricted. Please talk to Zac or Mariah about using this feature.",
    };
  }

  // Check if AI is enabled in team settings
  if (!teamData.settings?.aiEnabled) {
    return {
      allowed: false,
      reason: "AI features are disabled for this team.",
    };
  }

  // Return allowed with settings
  return {
    allowed: true,
    settings: {
      monthlyBudgetUsd: teamData.settings.aiMonthlyBudgetUsd ?? 10.0,
      maxTokensPerRequest: teamData.settings.aiMaxTokensPerRequest ?? 4000,
      maxRequestsPerDay: teamData.settings.aiMaxRequestsPerDay ?? 100,
    },
  };
}

export async function checkDailyUsageLimit(
  teamId: string,
  maxRequests: number
): Promise<{ withinLimit: boolean; currentCount: number }> {
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Get today's usage count
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const usageCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.teamId, teamId),
        gte(aiUsage.createdAt, today)
      )
    );

  const currentCount = usageCount[0]?.count ?? 0;

  return {
    withinLimit: currentCount < maxRequests,
    currentCount,
  };
}

export async function getMonthlyUsage(teamId: string): Promise<{
  totalRequests: number;
  totalCostUsd: number;
  budgetUsd: number;
  percentUsed: number;
}> {
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  // Get current month's usage
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const usage = await db
    .select({
      count: sql<number>`count(*)`,
      totalCost: sql<number>`sum(${aiUsage.estimatedCostUsd})`,
    })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.teamId, teamId),
        gte(aiUsage.createdAt, firstDayOfMonth)
      )
    );

  const totalRequests = usage[0]?.count ?? 0;
  const totalCostUsd = usage[0]?.totalCost ?? 0;

  // Get budget from team settings
  const teamData = await db.query.teamSettings.findFirst({
    where: eq(teamSettings.teamId, teamId),
  });

  const budgetUsd = teamData?.aiMonthlyBudgetUsd ?? 10.0;

  return {
    totalRequests,
    totalCostUsd,
    budgetUsd,
    percentUsed: (totalCostUsd / budgetUsd) * 100,
  };
}
```

### 3.2 Create Permission Check Middleware

**File**: `food-tracker/src/lib/ai/permissions.ts`

```typescript
import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "./access-control";

export async function requireAiAccess() {
  const session = await getSessionFromCookie();

  if (!session) {
    throw new Error("Unauthorized - please sign in");
  }

  if (!session.activeTeamId) {
    throw new Error("No active team selected");
  }

  const accessCheck = await checkAiAccess(session.activeTeamId);

  if (!accessCheck.allowed) {
    throw new Error(accessCheck.reason ?? "AI access denied");
  }

  return {
    session,
    settings: accessCheck.settings!,
  };
}
```

**Task Checklist**:
- [ ] Create `src/lib/ai/access-control.ts`
- [ ] Implement `checkAiAccess()` with team_default restriction
- [ ] Implement `checkDailyUsageLimit()`
- [ ] Implement `getMonthlyUsage()`
- [ ] Create `src/lib/ai/permissions.ts`
- [ ] Test access control logic

---

## Phase 4: AI Tools Library for D1 Queries

**Design Philosophy**: Tools are modular, reusable functions that can be used in AI chat, server actions, or other contexts. Each tool exports a clean interface with Zod v4 schemas for AI SDK compatibility.

### 4.1 Create Recipe Tools

**File**: `food-tracker/src/lib/ai/tools/recipe-tools.ts`

```typescript
import "server-only";
import * as z4 from "zod/v4";
import { eq, like, and, or, sql } from "drizzle-orm";
import { recipes } from "@/db/schema";

/**
 * Recipe tools for AI assistants and other contexts
 * Provides search, create, and update operations on recipes
 * All operations are scoped to teamId for security
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type RecipeToolContext = {
  db: any;
  teamId: string;
  userId: string;
};

// ============================================================================
// Zod Schemas (v4 for AI SDK compatibility)
// ============================================================================

export const searchRecipesSchema = z4.object({
  query: z4.string().optional().describe("Search query to match against recipe name"),
  mealType: z4
    .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
    .optional()
    .describe("Filter by meal type"),
  difficulty: z4
    .enum(["easy", "medium", "hard"])
    .optional()
    .describe("Filter by difficulty level"),
  tags: z4.array(z4.string()).optional().describe("Filter by tags (e.g., ['vegetarian', 'quick'])"),
  limit: z4.number().default(10).describe("Maximum number of results (default 10, max 50)"),
});

export const addRecipeSchema = z4.object({
  name: z4.string().min(1).describe("Recipe name"),
  emoji: z4.string().optional().describe("Emoji icon for the recipe (e.g., '🍕')"),
  mealType: z4
    .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
    .describe("Type of meal"),
  difficulty: z4
    .enum(["easy", "medium", "hard"])
    .optional()
    .describe("Difficulty level"),
  tags: z4.array(z4.string()).optional().describe("Tags for categorization (e.g., ['vegetarian', 'quick'])"),
  ingredients: z4.array(z4.string()).optional().describe("List of ingredients"),
  recipeBody: z4.string().optional().describe("Recipe instructions/notes in markdown"),
  recipeLink: z4.string().url().optional().describe("URL to original recipe"),
});

export const updateRecipeMetadataSchema = z4.object({
  recipeId: z4.string().describe("Recipe ID (starts with rcp_)"),
  name: z4.string().optional().describe("New recipe name"),
  emoji: z4.string().optional().describe("New emoji icon"),
  mealType: z4
    .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
    .optional()
    .describe("New meal type"),
  difficulty: z4
    .enum(["easy", "medium", "hard"])
    .optional()
    .describe("New difficulty level"),
  tags: z4.array(z4.string()).optional().describe("New tags array (replaces existing tags)"),
});

// ============================================================================
// Tool Implementations
// ============================================================================

export async function searchRecipes(
  context: RecipeToolContext,
  params: z4.infer<typeof searchRecipesSchema>
) {
  const { db, teamId } = context;
  const { query, mealType, difficulty, tags, limit = 10 } = params;

  // Cap limit at 50 to prevent token overuse
  const safeLimit = Math.min(limit, 50);

  // Build where conditions
  const conditions = [eq(recipes.teamId, teamId)];

  if (query) {
    conditions.push(like(recipes.name, `%${query}%`));
  }

  if (mealType) {
    conditions.push(eq(recipes.mealType, mealType));
  }

  if (difficulty) {
    conditions.push(eq(recipes.difficulty, difficulty));
  }

  const results = await db.query.recipes.findMany({
    where: and(...conditions),
    limit: safeLimit,
  });

  // Filter by tags if provided (JSON filtering in JS since D1 JSON queries are limited)
  let filteredResults = results;
  if (tags && tags.length > 0) {
    filteredResults = results.filter((r: any) => {
      const recipeTags = r.tags || [];
      return tags.some(tag => recipeTags.includes(tag));
    });
  }

  return {
    count: filteredResults.length,
    recipes: filteredResults.map((r: any) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      mealType: r.mealType,
      difficulty: r.difficulty,
      tags: r.tags,
      lastMadeDate: r.lastMadeDate,
      mealsEatenCount: r.mealsEatenCount,
    })),
  };
}

export async function addRecipe(
  context: RecipeToolContext,
  params: z4.infer<typeof addRecipeSchema>
) {
  const { db, teamId } = context;
  const { name, emoji, mealType, difficulty, tags, ingredients, recipeBody, recipeLink } = params;

  try {
    // Insert new recipe (id auto-generated by schema)
    const result = await db.insert(recipes).values({
      teamId,
      name,
      emoji: emoji || "🍽️",
      mealType,
      difficulty: difficulty || "medium",
      tags: tags || [],
      ingredients: ingredients || [],
      recipeBody: recipeBody || "",
      recipeLink: recipeLink || null,
      visibility: "team", // Default visibility
    }).returning();

    const newRecipe = result[0];

    return {
      success: true,
      recipe: {
        id: newRecipe.id,
        name: newRecipe.name,
        emoji: newRecipe.emoji,
        mealType: newRecipe.mealType,
        difficulty: newRecipe.difficulty,
      },
      message: `Recipe "${name}" created successfully!`,
    };
  } catch (error) {
    console.error("Error creating recipe:", error);
    return {
      success: false,
      error: "Failed to create recipe. Please try again.",
    };
  }
}

export async function updateRecipeMetadata(
  context: RecipeToolContext,
  params: z4.infer<typeof updateRecipeMetadataSchema>
) {
  const { db, teamId } = context;
  const { recipeId, name, emoji, mealType, difficulty, tags } = params;

  try {
    // Verify recipe exists and belongs to team
    const existing = await db.query.recipes.findFirst({
      where: and(
        eq(recipes.id, recipeId),
        eq(recipes.teamId, teamId)
      ),
    });

    if (!existing) {
      return {
        success: false,
        error: "Recipe not found or access denied",
      };
    }

    // Build update object (only include provided fields)
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (emoji !== undefined) updates.emoji = emoji;
    if (mealType !== undefined) updates.mealType = mealType;
    if (difficulty !== undefined) updates.difficulty = difficulty;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        error: "No updates provided",
      };
    }

    // Update recipe
    await db
      .update(recipes)
      .set(updates)
      .where(eq(recipes.id, recipeId));

    return {
      success: true,
      message: `Recipe "${existing.name}" updated successfully`,
      updates,
    };
  } catch (error) {
    console.error("Error updating recipe:", error);
    return {
      success: false,
      error: "Failed to update recipe",
    };
  }
}

// ============================================================================
// AI SDK Tool Wrapper
// ============================================================================

/**
 * Creates AI SDK-compatible tools for recipe operations
 * Use this in AI chat routes or anywhere you need AI SDK tool format
 */
export function createRecipeTools(context: RecipeToolContext) {
  return {
    search_recipes: {
      description: "Search recipes by name, tags, meal type, or difficulty. Returns a list of matching recipes.",
      parameters: z4.object({
        query: z4.string().optional().describe("Search query to match against recipe name"),
        mealType: z4
          .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
          .optional()
          .describe("Filter by meal type"),
        difficulty: z4
          .enum(["easy", "medium", "hard"])
          .optional()
          .describe("Filter by difficulty level"),
        tags: z4.array(z4.string()).optional().describe("Filter by tags (e.g., ['vegetarian', 'quick'])"),
        limit: z4.number().default(10).describe("Maximum number of results (default 10, max 50)"),
      }),
      execute: async ({
        query,
        mealType,
        difficulty,
        tags,
        limit = 10,
      }: {
        query?: string;
        mealType?: string;
        difficulty?: string;
        tags?: string[];
        limit?: number;
      }) => {
        // Cap limit at 50 to prevent token overuse
        const safeLimit = Math.min(limit, 50);

        // Build where conditions
        const conditions = [eq(recipes.teamId, teamId)];

        if (query) {
          conditions.push(like(recipes.name, `%${query}%`));
        }

        if (mealType) {
          conditions.push(eq(recipes.mealType, mealType));
        }

        if (difficulty) {
          conditions.push(eq(recipes.difficulty, difficulty));
        }

        const results = await db.query.recipes.findMany({
          where: and(...conditions),
          limit: safeLimit,
        });

        // Filter by tags if provided (JSON filtering in JS since D1 JSON queries are limited)
        let filteredResults = results;
        if (tags && tags.length > 0) {
          filteredResults = results.filter((r: any) => {
            const recipeTags = r.tags || [];
            return tags.some(tag => recipeTags.includes(tag));
          });
        }

        return {
          count: filteredResults.length,
          recipes: filteredResults.map((r: any) => ({
            id: r.id,
            name: r.name,
            emoji: r.emoji,
            mealType: r.mealType,
            difficulty: r.difficulty,
            tags: r.tags,
            lastMadeDate: r.lastMadeDate,
            mealsEatenCount: r.mealsEatenCount,
          })),
        };
      },
    },

    add_recipe: {
      description: "Create a new recipe in the database. Use this when the user wants to add a recipe.",
      parameters: z4.object({
        name: z4.string().min(1).describe("Recipe name"),
        emoji: z4.string().optional().describe("Emoji icon for the recipe (e.g., '🍕')"),
        mealType: z4
          .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
          .describe("Type of meal"),
        difficulty: z4
          .enum(["easy", "medium", "hard"])
          .optional()
          .describe("Difficulty level"),
        tags: z4.array(z4.string()).optional().describe("Tags for categorization (e.g., ['vegetarian', 'quick'])"),
        ingredients: z4.array(z4.string()).optional().describe("List of ingredients"),
        recipeBody: z4.string().optional().describe("Recipe instructions/notes in markdown"),
        recipeLink: z4.string().url().optional().describe("URL to original recipe"),
      }),
      execute: async ({
        name,
        emoji,
        mealType,
        difficulty,
        tags,
        ingredients,
        recipeBody,
        recipeLink,
      }: {
        name: string;
        emoji?: string;
        mealType: string;
        difficulty?: string;
        tags?: string[];
        ingredients?: string[];
        recipeBody?: string;
        recipeLink?: string;
      }) => {
        try {
          // Insert new recipe (id auto-generated by schema)
          const result = await db.insert(recipes).values({
            teamId,
            name,
            emoji: emoji || "🍽️",
            mealType,
            difficulty: difficulty || "medium",
            tags: tags || [],
            ingredients: ingredients || [],
            recipeBody: recipeBody || "",
            recipeLink: recipeLink || null,
            visibility: "team", // Default visibility
          }).returning();

          const newRecipe = result[0];

          return {
            success: true,
            recipe: {
              id: newRecipe.id,
              name: newRecipe.name,
              emoji: newRecipe.emoji,
              mealType: newRecipe.mealType,
              difficulty: newRecipe.difficulty,
            },
            message: `Recipe "${name}" created successfully!`,
          };
        } catch (error) {
          console.error("Error creating recipe:", error);
          return {
            success: false,
            error: "Failed to create recipe. Please try again.",
          };
        }
      },
    },

    update_recipe_metadata: {
      description: "Update recipe metadata (name, emoji, tags, meal type, difficulty). Does NOT update ingredients or recipe body.",
      parameters: z4.object({
        recipeId: z4.string().describe("Recipe ID (starts with rcp_)"),
        name: z4.string().optional().describe("New recipe name"),
        emoji: z4.string().optional().describe("New emoji icon"),
        mealType: z4
          .enum(["breakfast", "lunch", "dinner", "dessert", "snack", "appetizer"])
          .optional()
          .describe("New meal type"),
        difficulty: z4
          .enum(["easy", "medium", "hard"])
          .optional()
          .describe("New difficulty level"),
        tags: z4.array(z4.string()).optional().describe("New tags array (replaces existing tags)"),
      }),
      execute: async ({
        recipeId,
        name,
        emoji,
        mealType,
        difficulty,
        tags,
      }: {
        recipeId: string;
        name?: string;
        emoji?: string;
        mealType?: string;
        difficulty?: string;
        tags?: string[];
      }) => {
        try {
          // Verify recipe exists and belongs to team
          const existing = await db.query.recipes.findFirst({
            where: and(
              eq(recipes.id, recipeId),
              eq(recipes.teamId, teamId)
            ),
          });

          if (!existing) {
            return {
              success: false,
              error: "Recipe not found or access denied",
            };
          }

          // Build update object (only include provided fields)
          const updates: any = {};
          if (name !== undefined) updates.name = name;
          if (emoji !== undefined) updates.emoji = emoji;
          if (mealType !== undefined) updates.mealType = mealType;
          if (difficulty !== undefined) updates.difficulty = difficulty;
          if (tags !== undefined) updates.tags = tags;

          if (Object.keys(updates).length === 0) {
            return {
              success: false,
              error: "No updates provided",
            };
          }

          // Update recipe
          await db
            .update(recipes)
            .set(updates)
            .where(eq(recipes.id, recipeId));

          return {
            success: true,
            message: `Recipe "${existing.name}" updated successfully`,
            updates,
          };
        } catch (error) {
          console.error("Error updating recipe:", error);
          return {
            success: false,
            error: "Failed to update recipe",
          };
        }
      },
    },
  };
}
```

### 4.2 Create Schedule/Week Tools

**File**: `food-tracker/src/lib/ai/tools/schedule-tools.ts`

```typescript
import "server-only";
import * as z4 from "zod/v4";
import { weeks, weekRecipes, recipes } from "@/db/schema";
import { eq, and, or, gte, lte } from "drizzle-orm";

export function createScheduleTools(db: any, teamId: string, userId: string) {
  return {
    search_weeks: {
      description: "Search weeks/meal schedules by status, date range, or name. Returns matching weeks with their assigned recipes.",
      parameters: z4.object({
        status: z4
          .enum(["current", "upcoming", "archived"])
          .optional()
          .describe("Filter by week status"),
        query: z4.string().optional().describe("Search query for week name"),
        includeRecipes: z4.boolean().default(true).describe("Include assigned recipes in results"),
        limit: z4.number().default(10).describe("Maximum number of results (default 10, max 20)"),
      }),
      execute: async ({
        status,
        query,
        includeRecipes = true,
        limit = 10,
      }: {
        status?: string;
        query?: string;
        includeRecipes?: boolean;
        limit?: number;
      }) => {
        // Cap limit
        const safeLimit = Math.min(limit, 20);

        // Build where conditions
        const conditions = [eq(weeks.teamId, teamId)];

        if (status) {
          conditions.push(eq(weeks.status, status));
        }

        // Query weeks
        const results = await db.query.weeks.findMany({
          where: and(...conditions),
          limit: safeLimit,
          orderBy: (weeks: any, { desc }: any) => [desc(weeks.startDate)],
          with: includeRecipes
            ? {
                weekRecipes: {
                  with: {
                    recipe: true,
                  },
                },
              }
            : undefined,
        });

        // Filter by name query if provided
        let filteredResults = results;
        if (query) {
          filteredResults = results.filter((w: any) =>
            w.name.toLowerCase().includes(query.toLowerCase())
          );
        }

        return {
          count: filteredResults.length,
          weeks: filteredResults.map((w: any) => ({
            id: w.id,
            name: w.name,
            emoji: w.emoji,
            status: w.status,
            startDate: w.startDate,
            endDate: w.endDate,
            weekNumber: w.weekNumber,
            recipes: includeRecipes
              ? w.weekRecipes.map((wr: any) => ({
                  recipeId: wr.recipe.id,
                  name: wr.recipe.name,
                  emoji: wr.recipe.emoji,
                  mealType: wr.recipe.mealType,
                  made: wr.made,
                  order: wr.order,
                }))
              : undefined,
          })),
        };
      },
    },

    update_week: {
      description: "Update week metadata (name, emoji, status, dates). Does NOT modify assigned recipes. Use this to change week status (current → archived) or update week details.",
      parameters: z4.object({
        weekId: z4.string().describe("Week ID (starts with wk_)"),
        name: z4.string().optional().describe("New week name"),
        emoji: z4.string().optional().describe("New emoji icon"),
        status: z4
          .enum(["current", "upcoming", "archived"])
          .optional()
          .describe("New status"),
        startDate: z4.string().optional().describe("New start date (ISO format: YYYY-MM-DD)"),
        endDate: z4.string().optional().describe("New end date (ISO format: YYYY-MM-DD)"),
      }),
      execute: async ({
        weekId,
        name,
        emoji,
        status,
        startDate,
        endDate,
      }: {
        weekId: string;
        name?: string;
        emoji?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
      }) => {
        try {
          // Verify week exists and belongs to team
          const existing = await db.query.weeks.findFirst({
            where: and(eq(weeks.id, weekId), eq(weeks.teamId, teamId)),
          });

          if (!existing) {
            return {
              success: false,
              error: "Week not found or access denied",
            };
          }

          // Build update object
          const updates: any = {};
          if (name !== undefined) updates.name = name;
          if (emoji !== undefined) updates.emoji = emoji;
          if (status !== undefined) updates.status = status;
          if (startDate !== undefined) updates.startDate = startDate;
          if (endDate !== undefined) updates.endDate = endDate;

          if (Object.keys(updates).length === 0) {
            return {
              success: false,
              error: "No updates provided",
            };
          }

          // Update week
          await db.update(weeks).set(updates).where(eq(weeks.id, weekId));

          return {
            success: true,
            message: `Week "${existing.name}" updated successfully`,
            updates,
          };
        } catch (error) {
          console.error("Error updating week:", error);
          return {
            success: false,
            error: "Failed to update week",
          };
        }
      },
    },
  };
}
```

### 4.3 Create Cost Tracking Utility

**File**: `food-tracker/src/lib/ai/cost-tracking.ts`

```typescript
import "server-only";
import { aiUsage } from "@/db/schema";

const MODEL_COSTS = {
  // Google Gemini models (primary choice)
  "gemini-2.5-flash": { prompt: 0, completion: 0 }, // Free during preview
  "gemini-2.5-flash-lite": { prompt: 0, completion: 0 }, // Free during preview
  "gemini-1.5-flash": { prompt: 0.00001875, completion: 0.000075 }, // $0.075/$0.30 per 1M tokens
  "gemini-1.5-flash-8b": { prompt: 0.0000075, completion: 0.00003 }, // $0.03/$0.12 per 1M tokens
  "gemini-1.5-pro": { prompt: 0.00125, completion: 0.005 }, // $1.25/$5.00 per 1M tokens

  // OpenAI models (for reference)
  "gpt-4": { prompt: 0.03, completion: 0.06 },
  "gpt-4o": { prompt: 0.005, completion: 0.015 },
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },

  // Anthropic models (for reference)
  "claude-3-5-sonnet-20241022": { prompt: 0.003, completion: 0.015 },
  "claude-3-haiku-20240307": { prompt: 0.00025, completion: 0.00125 },

  // Cloudflare Workers AI (for reference)
  "@cf/meta/llama-3-8b-instruct": { prompt: 0.000011, completion: 0.000011 },
} as const;

export function calculateCost(
  model: string,
  usage: {
    promptTokens: number;
    completionTokens: number;
  }
): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  return (
    (usage.promptTokens / 1000) * costs.prompt +
    (usage.completionTokens / 1000) * costs.completion
  );
}

export async function trackUsage(
  db: any,
  data: {
    userId: string;
    teamId: string;
    model: string;
    endpoint: string;
    promptTokens: number;
    completionTokens: number;
    finishReason?: string;
    conversationId?: string;
  }
) {
  const cost = calculateCost(data.model, {
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
  });

  await db.insert(aiUsage).values({
    userId: data.userId,
    teamId: data.teamId,
    model: data.model,
    endpoint: data.endpoint,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens: data.promptTokens + data.completionTokens,
    estimatedCostUsd: cost,
    finishReason: data.finishReason,
    conversationId: data.conversationId,
  });

  return cost;
}
```

**Task Checklist**:
- [ ] Create `src/lib/ai/tools/recipe-tools.ts`
- [ ] Implement `search_recipes` (with filters for name, mealType, difficulty, tags)
- [ ] Implement `add_recipe` (create new recipes)
- [ ] Implement `update_recipe_metadata` (update name, emoji, tags, mealType, difficulty)
- [ ] Create `src/lib/ai/tools/schedule-tools.ts`
- [ ] Implement `search_weeks` (filter by status, include recipes)
- [ ] Implement `update_week` (update name, emoji, status, dates)
- [ ] Create `src/lib/ai/cost-tracking.ts`
- [ ] Add cost calculation for all supported models
- [ ] Test tool execution with mock D1 database

---

## Phase 5: API Route Implementation

### 5.1 Create Chat Route Handler

**File**: `food-tracker/src/app/api/chat/route.ts`

```typescript
import "server-only";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { requireAiAccess } from "@/lib/ai/permissions";
import { checkDailyUsageLimit } from "@/lib/ai/access-control";
import { createRecipeTools } from "@/lib/ai/tools/recipe-tools";
import { createScheduleTools } from "@/lib/ai/tools/schedule-tools";
import { trackUsage } from "@/lib/ai/cost-tracking";

export const runtime = "nodejs"; // OpenNext uses Node runtime

export async function POST(req: Request) {
  try {
    // Auth & permission check
    const { session, settings } = await requireAiAccess();

    // Check daily rate limit
    const usageLimit = await checkDailyUsageLimit(
      session.activeTeamId!,
      settings.maxRequestsPerDay
    );

    if (!usageLimit.withinLimit) {
      return new Response(
        JSON.stringify({
          error: `Daily limit reached (${settings.maxRequestsPerDay} requests/day)`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get Cloudflare bindings
    const { env } = await getCloudflareContext();
    const db = drizzle(env.NEXT_TAG_CACHE_D1);

    // Parse request
    const { messages } = await req.json();

    // Get or create conversation ID
    const conversationId = req.headers.get("x-conversation-id") ?? undefined;

    // Combine tools from all modules
    const recipeTools = createRecipeTools(db, session.activeTeamId!, session.user.id);
    const scheduleTools = createScheduleTools(db, session.activeTeamId!, session.user.id);

    // Choose model based on complexity (can make this configurable)
    // gemini-2.5-flash: Fast, good for simple queries
    // gemini-2.5-flash-lite: Ultra-fast, cheapest, for very simple queries
    const modelName = "gemini-2.5-flash";

    // Stream AI response
    const result = await streamText({
      model: google(modelName),
      messages,
      system: `You are a meal planning assistant for Food Tracker. Your role is to help users manage their recipes and weekly meal schedules efficiently.

## Your Capabilities

You can help users:
1. **Search & Browse Recipes**: Find recipes by name, meal type (breakfast/lunch/dinner/snack/dessert/appetizer), difficulty (easy/medium/hard), or tags (e.g., vegetarian, quick, healthy)
2. **Add New Recipes**: Create recipes with name, emoji, meal type, difficulty, ingredients, instructions, and tags
3. **Update Recipes**: Modify recipe metadata like name, emoji, tags, meal type, or difficulty
4. **Search Weeks**: Find meal schedules by status (current/upcoming/archived), view assigned recipes
5. **Update Weeks**: Change week status, dates, name, or emoji

## Guidelines

**When users ask about recipes:**
- Use \`search_recipes\` to find existing recipes first before suggesting they add new ones
- Pay attention to filters: mealType, difficulty, tags
- Suggest relevant meal types for the time of day or context
- When adding recipes, always include an appropriate emoji and meal type

**When users ask about meal planning:**
- Use \`search_weeks\` with status filter: "current" for this week, "upcoming" for future weeks, "archived" for past weeks
- Include recipes in the response to show what's already planned
- Help organize meals by suggesting appropriate meal types for different days
- When updating weeks, use \`update_week\` to change status or details

**When users want to modify data:**
- Always confirm the specific recipe or week to update before making changes
- For recipes: use \`update_recipe_metadata\` (don't modify ingredients or full recipe body)
- For weeks: use \`update_week\` (don't modify assigned recipes, only metadata)
- Return success confirmations with details about what was changed

**Best Practices:**
- Be proactive: if a user asks "what should I make for dinner?", search their recipes for dinner options
- Be specific: when showing results, include emoji, meal type, and tags to help users identify recipes
- Be helpful: suggest ways to organize recipes (by tags, meal type) or plan weeks efficiently
- Stay focused: only help with food scheduling tasks - recipes, meals, and weekly planning

**Tone:**
- Friendly and conversational
- Concise responses (don't over-explain)
- Use food emojis when relevant
- Focus on actionable suggestions

## Example Interactions

User: "What recipes do I have for dinner?"
You: *Use search_recipes with mealType="dinner"* → Show list with emojis and tags

User: "Add a new recipe for pasta carbonara"
You: *Ask for details if needed (difficulty, tags), then use add_recipe*

User: "What's on the menu this week?"
You: *Use search_weeks with status="current" and includeRecipes=true*

User: "Mark this week as archived"
You: *Ask for week ID or search for current week, then use update_week with status="archived"*`,
      tools: {
        ...recipeTools,
        ...scheduleTools,
      },
      maxTokens: settings.maxTokensPerRequest,
      maxSteps: 5, // Limit tool call iterations
      onFinish: async ({ usage, finishReason }) => {
        // Track usage in database
        try {
          await trackUsage(db, {
            userId: session.user.id,
            teamId: session.activeTeamId!,
            model: modelName,
            endpoint: "/api/chat",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            finishReason,
            conversationId,
          });
        } catch (error) {
          console.error("Failed to track AI usage:", error);
          // Don't fail the request if tracking fails
        }
      },
    });

    // Return streaming response with proper headers
    return result.toDataStreamResponse({
      headers: {
        "Content-Encoding": "identity", // Critical for Cloudflare streaming!
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

**Task Checklist**:
- [ ] Create `src/app/api/chat/route.ts`
- [ ] Implement auth and permission checks
- [ ] Add rate limiting (daily request limit)
- [ ] Integrate recipe and schedule tools
- [ ] Add cost tracking in `onFinish` callback
- [ ] Set proper streaming headers
- [ ] Add error handling
- [ ] Test locally with `pnpm dev`

---

## Phase 6: Chat UI Implementation

### 6.1 Create Blocked Access Component

**File**: `food-tracker/src/app/(dashboard)/ai-assistant/_components/blocked-access.tsx`

```typescript
"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BlockedAccess() {
  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-amber-900">AI Assistant Unavailable</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p>
                This feature is currently restricted to specific teams.
              </p>
              <p className="font-medium">
                Please talk to Zac or Mariah about using this feature.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 6.2 Create Main Chat Page

**File**: `food-tracker/src/app/(dashboard)/ai-assistant/page.tsx`

```typescript
import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "@/lib/ai/access-control";
import { BlockedAccess } from "./_components/blocked-access";
import { ChatInterface } from "./_components/chat-interface";
import { redirect } from "next/navigation";

export const metadata = {
  title: "AI Assistant | Food Tracker",
  description: "AI-powered cooking and meal planning assistant",
};

export default async function AIAssistantPage() {
  // Check auth
  const session = await getSessionFromCookie();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.activeTeamId) {
    return <div>No active team selected</div>;
  }

  // Check AI access
  const accessCheck = await checkAiAccess(session.activeTeamId);

  if (!accessCheck.allowed) {
    return <BlockedAccess />;
  }

  // Render chat interface
  return <ChatInterface settings={accessCheck.settings!} />;
}
```

### 6.3 Create Chat Interface Component

**File**: `food-tracker/src/app/(dashboard)/ai-assistant/_components/chat-interface.tsx`

```typescript
"use client";

import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Loader2, Send } from "lucide-react";
import { useState } from "react";

interface ChatInterfaceProps {
  settings: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
}

export function ChatInterface({ settings }: ChatInterfaceProps) {
  const [conversationId] = useState(() => `conv_${Date.now()}`);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
      headers: {
        "x-conversation-id": conversationId,
      },
      onError: (error) => {
        console.error("Chat error:", error);
      },
    });

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Cooking Assistant
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ask about recipes, meal planning, or get cooking suggestions
          </p>
        </CardHeader>
      </Card>

      <Card className="h-[600px] flex flex-col">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start a conversation by asking about recipes or meal planning</p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}

                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {/* Display tool calls */}
                  {message.toolInvocations && message.toolInvocations.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.toolInvocations.map((tool, idx) => (
                        <div
                          key={idx}
                          className="text-xs bg-background/50 rounded p-2 border"
                        >
                          <div className="font-mono font-medium">
                            🔧 {tool.toolName}
                          </div>
                          {tool.state === "result" && (
                            <pre className="mt-1 overflow-auto text-xs">
                              {JSON.stringify(tool.result, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-sm text-destructive">
                Error: {error.message}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about recipes, meal planning, or cooking tips..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Max tokens: {settings.maxTokensPerRequest.toLocaleString()} | Daily
            limit: {settings.maxRequestsPerDay} requests
          </p>
        </div>
      </Card>
    </div>
  );
}
```

**Task Checklist**:
- [ ] Create `blocked-access.tsx` component
- [ ] Create `chat-interface.tsx` component
- [ ] Create main `page.tsx` with access check
- [ ] Style with Shadcn components
- [ ] Add conversation ID tracking
- [ ] Display tool invocations in UI
- [ ] Test blocked access message
- [ ] Test chat with team_default

---

## Phase 7: Navigation Integration

### 7.1 Add to Sidebar Navigation

**File**: Find the sidebar nav component (likely `src/components/layout/sidebar-nav.tsx` or similar)

Add the AI Assistant link:

```typescript
import { Sparkles } from "lucide-react"; // Or your preferred icon

// Add to navigation items array
{
  name: "AI Assistant",
  href: "/ai-assistant",
  icon: Sparkles,
  badge: "New", // Optional
}
```

### 7.2 Update Mobile Navigation

If there's a separate mobile nav component, add the same link there.

**Task Checklist**:
- [ ] Find sidebar navigation component
- [ ] Add AI Assistant link with icon
- [ ] Add to mobile navigation (if separate)
- [ ] Test navigation from all pages
- [ ] Verify active state styling

---

## Phase 8: Usage Analytics Dashboard

### 8.1 Create Usage Analytics Page

**File**: `food-tracker/src/app/(dashboard)/ai-assistant/usage/page.tsx`

```typescript
import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess, getMonthlyUsage } from "@/lib/ai/access-control";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { aiUsage } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UsageStats } from "./_components/usage-stats";
import { UsageHistory } from "./_components/usage-history";

export default async function AIUsagePage() {
  const session = await getSessionFromCookie();
  if (!session || !session.activeTeamId) {
    redirect("/sign-in");
  }

  const accessCheck = await checkAiAccess(session.activeTeamId);
  if (!accessCheck.allowed) {
    redirect("/ai-assistant");
  }

  // Get monthly usage stats
  const monthlyStats = await getMonthlyUsage(session.activeTeamId);

  // Get recent usage history
  const { env } = await getCloudflareContext();
  const db = drizzle(env.NEXT_TAG_CACHE_D1);

  const recentUsage = await db.query.aiUsage.findMany({
    where: eq(aiUsage.teamId, session.activeTeamId),
    orderBy: desc(aiUsage.createdAt),
    limit: 50,
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Usage Analytics</h1>
        <p className="text-muted-foreground">
          Monitor AI assistant usage and costs for your team
        </p>
      </div>

      <UsageStats stats={monthlyStats} />
      <UsageHistory usage={recentUsage} />
    </div>
  );
}
```

### 8.2 Create Usage Stats Component

**File**: `food-tracker/src/app/(dashboard)/ai-assistant/usage/_components/usage-stats.tsx`

```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DollarSign, MessageSquare, Percent, TrendingUp } from "lucide-react";

interface UsageStatsProps {
  stats: {
    totalRequests: number;
    totalCostUsd: number;
    budgetUsd: number;
    percentUsed: number;
  };
}

export function UsageStats({ stats }: UsageStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.totalRequests.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">This month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            ${stats.totalCostUsd.toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground">USD this month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Budget</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${stats.budgetUsd.toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">Allocated</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Budget Used</CardTitle>
          <Percent className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.percentUsed.toFixed(1)}%
          </div>
          <Progress
            value={Math.min(stats.percentUsed, 100)}
            className="mt-2"
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

### 8.3 Create Usage History Component

**File**: `food-tracker/src/app/(dashboard)/ai-assistant/usage/_components/usage-history.tsx`

```typescript
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

interface UsageHistoryProps {
  usage: Array<{
    id: string;
    createdAt: Date;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    user: {
      firstName: string | null;
      lastName: string | null;
      email: string;
    };
  }>;
}

export function UsageHistory({ usage }: UsageHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(record.createdAt), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell>
                  {record.user.firstName && record.user.lastName
                    ? `${record.user.firstName} ${record.user.lastName}`
                    : record.user.email}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {record.model}
                </TableCell>
                <TableCell className="text-right">
                  {record.totalTokens.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${record.estimatedCostUsd.toFixed(4)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

**Task Checklist**:
- [ ] Create usage analytics page
- [ ] Create usage stats component with cards
- [ ] Create usage history table
- [ ] Add date formatting (date-fns)
- [ ] Style with Shadcn components
- [ ] Add link to usage page from chat interface

---

## Phase 9: Team Settings Integration

### 9.1 Add AI Settings to Team Settings Page

Find the team settings page and add an AI configuration section:

**File**: `food-tracker/src/app/(settings)/teams/[teamSlug]/settings/page.tsx` (or similar)

Add a new section:

```typescript
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Add to the settings form
<Card>
  <CardHeader>
    <CardTitle>AI Assistant Settings</CardTitle>
    <CardDescription>
      Configure AI features for your team
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor="ai-enabled">Enable AI Assistant</Label>
        <p className="text-sm text-muted-foreground">
          Allow team members to use AI features
        </p>
      </div>
      <Switch id="ai-enabled" />
    </div>

    <div className="space-y-2">
      <Label htmlFor="ai-budget">Monthly Budget (USD)</Label>
      <Input
        id="ai-budget"
        type="number"
        step="0.01"
        placeholder="10.00"
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="ai-max-tokens">Max Tokens Per Request</Label>
      <Input
        id="ai-max-tokens"
        type="number"
        placeholder="4000"
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="ai-daily-limit">Daily Request Limit</Label>
      <Input
        id="ai-daily-limit"
        type="number"
        placeholder="100"
      />
    </div>
  </CardContent>
</Card>
```

### 9.2 Create Server Action for Updating Settings

**File**: `food-tracker/src/app/(settings)/teams/[teamSlug]/settings/settings.actions.ts`

```typescript
"use server";

import { createServerAction } from "zsa";
import { z } from "zod"; // Zod v3 for ZSA
import { getSessionFromCookie } from "@/utils/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { teamSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const updateAiSettings = createServerAction()
  .input(
    z.object({
      teamId: z.string(),
      aiEnabled: z.boolean(),
      aiMonthlyBudgetUsd: z.number().min(0).max(1000),
      aiMaxTokensPerRequest: z.number().min(100).max(100000),
      aiMaxRequestsPerDay: z.number().min(1).max(10000),
    })
  )
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new Error("Unauthorized");
    }

    // TODO: Check if user has permission to manage team settings

    const { env } = await getCloudflareContext();
    const db = drizzle(env.NEXT_TAG_CACHE_D1);

    await db
      .update(teamSettings)
      .set({
        aiEnabled: input.aiEnabled ? 1 : 0,
        aiMonthlyBudgetUsd: input.aiMonthlyBudgetUsd,
        aiMaxTokensPerRequest: input.aiMaxTokensPerRequest,
        aiMaxRequestsPerDay: input.aiMaxRequestsPerDay,
      })
      .where(eq(teamSettings.teamId, input.teamId));

    return { success: true };
  });
```

**Task Checklist**:
- [ ] Find team settings page
- [ ] Add AI settings card
- [ ] Create server action for updating settings
- [ ] Wire up form submission
- [ ] Add permission check (only team owners/admins)
- [ ] Test settings update

---

## Phase 10: Documentation Updates

### 10.1 Update CLAUDE.md with AI SDK Best Practices

**File**: `food-tracker/CLAUDE.md`

Add a new section:

```markdown
## AI SDK Integration

The project includes Vercel AI SDK for AI-powered features. All AI functionality is restricted to specific teams via team settings.

### Dual Zod Version Setup

**Critical**: This project uses both Zod v3 and Zod v4 simultaneously:
- **Zod v3**: Used by ZSA (zod-server-actions) for existing server actions
- **Zod v4**: Used by AI SDK for tool parameter validation

**Import patterns:**
```typescript
// For ZSA server actions (existing code)
import { z } from "zod";  // Gets Zod v3

// For AI SDK tools (new AI features)
import * as z4 from "zod/v4";  // Gets Zod v4
```

**Why this works**: Zod v3.25.76+ includes subpath exports for both versions in a single package. No npm aliases or duplicate packages needed.

### AI Route Handlers

**Location**: `src/app/api/chat/route.ts`

**Key patterns:**
- Use Route Handlers (NOT Server Actions) for streaming AI responses
- Always check permissions via `requireAiAccess()`
- Track usage in `onFinish` callback
- Set `Content-Encoding: identity` header for Cloudflare streaming
- Limit tokens and tool calls to prevent runaway costs

**Example:**
```typescript
import "server-only";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { requireAiAccess } from "@/lib/ai/permissions";
import * as z4 from "zod/v4";  // Use Zod v4 for AI SDK

export async function POST(req: Request) {
  const { session, settings } = await requireAiAccess();

  const result = await streamText({
    model: google("gemini-2.5-flash"),
    messages,
    tools: {
      getTool: {
        parameters: z4.object({ ... }),  // Use z4, not z
        execute: async (params) => { ... }
      }
    },
    maxTokens: settings.maxTokensPerRequest,
    onFinish: async ({ usage }) => {
      await trackUsage(db, { ... });
    }
  });

  return result.toDataStreamResponse({
    headers: { "Content-Encoding": "identity" }
  });
}
```

### AI Tools

**Location**: `src/lib/ai/tools/`

AI tools provide access to D1 database for the AI assistant:
- `recipe-tools.ts`: Recipe search, get, random selection
- `schedule-tools.ts`: Week schedule queries

**Guidelines:**
- Always scope queries to `teamId`
- Use Zod v4 for parameter schemas: `import * as z4 from "zod/v4"`
- Return structured data (not raw DB records)
- Include error handling
- Limit result sizes to prevent token overuse

### Access Control

**Team restriction**: AI features locked to `team_default` team only (configurable in `src/lib/ai/access-control.ts`)

**Permission checks:**
```typescript
import { requireAiAccess } from "@/lib/ai/permissions";

const { session, settings } = await requireAiAccess();
// Throws error if user lacks access
```

**Blocked teams**: See message: "Please talk to Zac or Mariah about using this feature"

### Cost Tracking

**All AI requests tracked in `ai_usage` table:**
- Prompt tokens, completion tokens
- Estimated cost in USD
- Model used, endpoint called
- User and team IDs

**View analytics**: `/ai-assistant/usage`

### Models & Providers

**Current setup**: Google Gemini 2.5 Flash via `@ai-sdk/google`

**Available Gemini models:**
- `gemini-2.5-flash`: Fast, free during preview, good for most queries
- `gemini-2.5-flash-lite`: Ultra-fast, free during preview, for simple queries
- `gemini-1.5-flash`: Production stable, $0.075/$0.30 per 1M tokens
- `gemini-1.5-flash-8b`: Smaller/faster, $0.03/$0.12 per 1M tokens
- `gemini-1.5-pro`: Most capable, $1.25/$5.00 per 1M tokens

**Switching models:**
```typescript
import { google } from "@ai-sdk/google";

// Use lite for very simple queries
const result = await streamText({
  model: google("gemini-2.5-flash-lite"),
  ...
});

// Use pro for complex reasoning
const result = await streamText({
  model: google("gemini-1.5-pro"),
  ...
});
```

**Alternative providers (if needed):**
- OpenAI (`@ai-sdk/openai`)
- Anthropic (`@ai-sdk/anthropic`)
- Cloudflare Workers AI (`@cloudflare/workers-ai-provider`)

### Environment Variables

**Required secrets:**
- `GOOGLE_GENERATIVE_AI_API_KEY`

**Get your API key**: https://aistudio.google.com/app/apikey

**Local**: Add to `.dev.vars`
**Production**: Deploy via `wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY`

### Common Gotchas

1. **Wrong Zod import**: Using `import { z } from "zod"` for AI tools will use v3, which may have compatibility issues. Always use `import * as z4 from "zod/v4"` for AI SDK.

2. **Forgetting streaming header**: Without `Content-Encoding: identity`, Cloudflare may buffer the entire response.

3. **No cost limits**: Always set `maxTokens` and track usage to prevent unexpected bills.

4. **Using Server Actions**: Server Actions don't support streaming. Use Route Handlers for AI endpoints.

5. **Team access check**: Don't forget `requireAiAccess()` in new AI endpoints.

### Testing

**Test Zod versions:**
```typescript
import { z } from "zod";
import * as z4 from "zod/v4";

console.log(z.string().parse("test"));   // v3
console.log(z4.string().parse("test"));  // v4
```

**Test chat locally:**
```bash
pnpm dev
# Navigate to /ai-assistant
```
```

**Task Checklist**:
- [ ] Add AI SDK section to CLAUDE.md
- [ ] Document dual Zod version pattern
- [ ] Document Route Handler best practices
- [ ] Add access control documentation
- [ ] Document cost tracking
- [ ] Add troubleshooting section

---

## Testing Checklist

### Access Control Testing
- [ ] Sign in as team_default user → Should see chat interface
- [ ] Sign in as different team user → Should see blocked message
- [ ] Verify blocked message shows correct text
- [ ] Test daily rate limit (make 101 requests)
- [ ] Test monthly budget warning

### Chat Functionality Testing
- [ ] Send basic message, verify streaming response
- [ ] Test recipe search tool call
- [ ] Test get recipe by ID tool call
- [ ] Test current week schedule tool call
- [ ] Verify tool results display in UI
- [ ] Test error handling (invalid recipe ID)

### Cost Tracking Testing
- [ ] Make several chat requests
- [ ] Check `/ai-assistant/usage` page
- [ ] Verify token counts are accurate
- [ ] Verify cost calculation is correct
- [ ] Check database `ai_usage` table directly

### Permission Testing
- [ ] Owner can update AI settings → ✅
- [ ] Admin can update AI settings → ✅
- [ ] Member cannot update AI settings → ❌
- [ ] Guest cannot access AI at all → ❌

### Integration Testing
- [ ] Navigation link works
- [ ] Mobile navigation includes AI link
- [ ] Chat persists conversation across refreshes (if implemented)
- [ ] Streaming works on production (Cloudflare)
- [ ] No CORS errors

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run `pnpm build` successfully
- [ ] Test locally with `pnpm preview`
- [ ] Verify no TypeScript errors
- [ ] Run migrations locally first

### Database Migrations
- [ ] Generate production migration
```bash
pnpm db:generate add-ai-chat-feature
```
- [ ] Review generated SQL
- [ ] Apply to production D1
```bash
wrangler d1 migrations apply $(node scripts/get-db-name.mjs) --remote
```
- [ ] Verify migration success
```bash
wrangler d1 migrations list $(node scripts/get-db-name.mjs) --remote
```

### Secrets Deployment
- [ ] Deploy `GOOGLE_GENERATIVE_AI_API_KEY`
```bash
wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```
- [ ] Verify secret exists
```bash
wrangler secret list
```

### Enable AI for team_default
- [ ] Connect to production D1
- [ ] Run SQL to enable AI
```sql
UPDATE team_settings
SET aiEnabled = 1, aiMonthlyBudgetUsd = 50.0
WHERE teamId = (SELECT id FROM team WHERE slug = 'team_default');
```

### Deploy Application
- [ ] Deploy via `pnpm deploy`
- [ ] Monitor deployment logs
- [ ] Verify deployment success

### Post-Deployment Testing
- [ ] Test AI chat on production URL
- [ ] Verify streaming works
- [ ] Check cost tracking in production DB
- [ ] Test blocked access for non-default teams
- [ ] Monitor Cloudflare Workers logs
- [ ] Check AI usage analytics page

---

## Success Criteria

✅ **Phase 1-10 complete**
✅ **AI chat accessible from sidebar**
✅ **team_default users can chat with AI**
✅ **Other teams see blocked message**
✅ **Tool calls work (recipes, schedules)**
✅ **Cost tracking records all requests**
✅ **Usage analytics page displays data**
✅ **Team settings allow AI configuration**
✅ **CLAUDE.md documents AI patterns**
✅ **Deployed to production successfully**

---

## Future Enhancements (Out of Scope)

- Conversation history persistence
- Multi-turn conversation context
- Recipe image generation
- Grocery list AI suggestions
- Voice input/output
- Fine-tuned model for recipe domain
- RAG with recipe embeddings (Vectorize)
- AI-powered recipe recommendations
- Natural language meal planning
- Export conversations

---

## Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Database schema | 1-2 hours |
| 2 | Dependencies & secrets | 30 minutes |
| 3 | Access control | 1-2 hours |
| 4 | AI tools library | 2-3 hours |
| 5 | API route | 2 hours |
| 6 | Chat UI | 2-3 hours |
| 7 | Navigation | 30 minutes |
| 8 | Usage analytics | 2-3 hours |
| 9 | Team settings | 1-2 hours |
| 10 | Documentation | 1 hour |
| Testing | All testing | 2-3 hours |

**Total**: 12-16 hours

---

## Resources

- [Vercel AI SDK Docs](https://sdk.vercel.ai/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Zod Versioning Guide](https://zod.dev/v4/versioning)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Integration Report](./vercel-ai-sdk-integration-report.md)
