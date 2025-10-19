# Team Recipe Visibility Settings

## Overview
Add team-level settings to control recipe visibility behavior. This includes two independent settings:

1. **Recipe Visibility Mode** - Controls which recipes team members can VIEW
2. **Default Recipe Visibility** - Controls the default visibility level when CREATING new recipes

## Setting Options

### Recipe Visibility Mode
Controls which recipes are visible to team members in listings and searches.

- `all` (default): Show team's own recipes (all visibilities) + all public recipes from other teams
- `team_only`: Show only recipes owned by the team (all visibilities)

### Default Recipe Visibility
Controls the default visibility level assigned to new recipes when created by team members.

- `public` (default): New recipes are visible to all teams
- `unlisted`: New recipes are accessible via direct link only, not shown in public listings
- `private`: New recipes are only visible to the team's members

**Note:** Users can override the default visibility when creating a recipe if the UI allows it.

## Database Changes

### Option 1: Add Team Settings Table (Recommended)
Create new `team_settings` table for extensible settings:

```typescript
export const teamSettingsTable = sqliteTable("team_settings", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `tset_${createId()}`).notNull(),
  teamId: text().notNull().unique().references(() => teamTable.id, { onDelete: 'cascade' }),

  // Recipe settings
  recipeVisibilityMode: text({ length: 20 }).notNull().default('all'),
  // Values: 'all', 'team_only'

  defaultRecipeVisibility: text({ length: 20 }).notNull().default('public'),
  // Values: 'public', 'private', 'unlisted'
  // Controls the default visibility when creating new recipes

  // Future settings can be added here
  // enabledFeatures: text({ mode: 'json' }).$type<string[]>(),
}, (table) => ([
  index("tset_team_idx").on(table.teamId),
]));
```

**Migration Steps:**
1. Run `pnpm db:generate add-team-settings-table`
2. Review generated migration in `src/db/migrations/`
3. Apply locally: `wrangler d1 migrations apply $(node scripts/get-db-name.mjs) --local`
4. Apply remote: `wrangler d1 migrations apply $(node scripts/get-db-name.mjs) --remote`
5. Seed existing teams with default settings:
```sql
INSERT INTO team_settings (id, teamId, recipeVisibilityMode, defaultRecipeVisibility, createdAt, updatedAt)
SELECT 'tset_' || substr(lower(hex(randomblob(16))), 1, 24), id, 'all', 'public', strftime('%s', 'now'), strftime('%s', 'now')
FROM team
WHERE NOT EXISTS (SELECT 1 FROM team_settings WHERE team_settings.teamId = team.id);
```

**Relations:**
```typescript
export const teamSettingsRelations = relations(teamSettingsTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamSettingsTable.teamId],
    references: [teamTable.id],
  }),
}));

// Update teamRelations
export const teamRelations = relations(teamTable, ({ many, one }) => ({
  // ... existing relations
  settings: one(teamSettingsTable),
}));
```

**Type Export:**
```typescript
export type TeamSettings = InferSelectModel<typeof teamSettingsTable>;
```

### Option 2: Add Column to Team Table (Simpler)
Add `recipeVisibilityMode` directly to `teamTable`:

```typescript
export const teamTable = sqliteTable("team", {
  // ... existing fields
  recipeVisibilityMode: text({ length: 20 }).notNull().default('all'),
});
```

**Recommendation:** Use Option 1 (separate table) for better extensibility.

## Server Function Changes

### Core Query Logic Update
Create helper function in `src/utils/recipe-visibility.ts`:

```typescript
import { eq, or, and } from "drizzle-orm";
import { recipesTable, teamSettingsTable, RECIPE_VISIBILITY } from "@/db/schema";
import type { SQL } from "drizzle-orm";

/**
 * Returns visibility conditions based on team settings
 * @param activeTeamId - Current team ID
 * @param teamSettings - Team settings (null = use defaults)
 */
export function getRecipeVisibilityConditions(
  activeTeamId: string,
  recipeVisibilityMode: 'all' | 'team_only' = 'all'
): SQL {
  if (recipeVisibilityMode === 'team_only') {
    // Show only own team's recipes
    return eq(recipesTable.teamId, activeTeamId);
  }

  // Show own team's recipes + other teams' public recipes
  return or(
    eq(recipesTable.teamId, activeTeamId),
    eq(recipesTable.visibility, RECIPE_VISIBILITY.PUBLIC)
  );
}
```

### Update `getRecipesAction`
**File:** `src/app/(dashboard)/recipes/recipes.actions.ts`

```typescript
export const getRecipesAction = createServerAction()
  .input(getRecipesSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session || !session.activeTeamId) {
      throw new ZSAError("UNAUTHORIZED", "Must be logged in with active team");
    }

    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();

    // Fetch team settings
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const visibilityMode = teamSettings?.recipeVisibilityMode || 'all';
    const visibilityConditions = getRecipeVisibilityConditions(
      session.activeTeamId,
      visibilityMode
    );

    // Build WHERE conditions
    const conditions = [visibilityConditions];

    // ... rest of existing filter logic (search, mealType, etc.)

    // Continue with existing query logic
  });
```

### Update `getRecipeByIdAction`
**File:** `src/app/(dashboard)/recipes/recipes.actions.ts`

```typescript
export const getRecipeByIdAction = createServerAction()
  .input(getRecipeByIdSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session || !session.activeTeamId) {
      throw new ZSAError("UNAUTHORIZED", "Must be logged in with active team");
    }

    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();

    // Fetch team settings
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const visibilityMode = teamSettings?.recipeVisibilityMode || 'all';
    const visibilityConditions = getRecipeVisibilityConditions(
      session.activeTeamId,
      visibilityMode
    );

    const [result] = await db
      .select({
        recipe: recipesTable,
        weekCount: sql<number>`count(distinct ${weekRecipesTable.weekId})`.as('weekCount'),
      })
      .from(recipesTable)
      .leftJoin(weekRecipesTable, eq(recipesTable.id, weekRecipesTable.recipeId))
      .where(and(
        eq(recipesTable.id, input.id),
        visibilityConditions
      ))
      .groupBy(recipesTable.id);

    // ... rest of existing logic
  });
```

### Update `getRecipeMetadataAction`
**File:** `src/app/(dashboard)/recipes/recipes.actions.ts`

```typescript
export const getRecipeMetadataAction = createServerAction()
  .handler(async () => {
    const session = await getSessionFromCookie();
    if (!session || !session.activeTeamId) {
      throw new ZSAError("UNAUTHORIZED", "Must be logged in with active team");
    }

    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.ACCESS_RECIPES);

    const db = getDB();

    // Fetch team settings
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const visibilityMode = teamSettings?.recipeVisibilityMode || 'all';
    const visibilityConditions = getRecipeVisibilityConditions(
      session.activeTeamId,
      visibilityMode
    );

    const recipes = await db.select({
      mealType: recipesTable.mealType,
      difficulty: recipesTable.difficulty,
      tags: recipesTable.tags,
    })
    .from(recipesTable)
    .where(visibilityConditions);

    // ... rest of existing logic
  });
```

### Other Recipe Query Locations to Update
Search codebase for recipe queries that may need updates:
- Week recipes queries (when adding recipes to weeks)
- Recipe book queries
- Recipe search/autocomplete components
- Any components that display recipe dropdowns/selectors

**Find with:**
```bash
grep -r "recipesTable" src/ --include="*.ts" --include="*.tsx"
grep -r "RECIPE_VISIBILITY" src/ --include="*.ts" --include="*.tsx"
```

## New Server Actions

### Create Team Settings Actions
**File:** `src/actions/team-settings.actions.ts`

```typescript
"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { teamSettingsTable, TEAM_PERMISSIONS } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";

const recipeVisibilityModeSchema = z.enum(['all', 'team_only']);
const defaultRecipeVisibilitySchema = z.enum(['public', 'private', 'unlisted']);

export const getTeamSettingsAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    let settings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    // Create default settings if none exist
    if (!settings) {
      const [newSettings] = await db.insert(teamSettingsTable)
        .values({ teamId: input.teamId })
        .returning();
      settings = newSettings;
    }

    return { settings };
  });

export const updateRecipeVisibilityModeAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
    recipeVisibilityMode: recipeVisibilityModeSchema,
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    // Check if settings exist
    const existing = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    let settings;
    if (existing) {
      // Update existing
      [settings] = await db.update(teamSettingsTable)
        .set({ recipeVisibilityMode: input.recipeVisibilityMode })
        .where(eq(teamSettingsTable.teamId, input.teamId))
        .returning();
    } else {
      // Create new
      [settings] = await db.insert(teamSettingsTable)
        .values({
          teamId: input.teamId,
          recipeVisibilityMode: input.recipeVisibilityMode,
        })
        .returning();
    }

    return { settings };
  });

export const updateDefaultRecipeVisibilityAction = createServerAction()
  .input(z.object({
    teamId: z.string(),
    defaultRecipeVisibility: defaultRecipeVisibilitySchema,
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("UNAUTHORIZED", "You must be logged in");
    }

    await requirePermission(session.user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const db = getDB();

    // Check if settings exist
    const existing = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, input.teamId),
    });

    let settings;
    if (existing) {
      // Update existing
      [settings] = await db.update(teamSettingsTable)
        .set({ defaultRecipeVisibility: input.defaultRecipeVisibility })
        .where(eq(teamSettingsTable.teamId, input.teamId))
        .returning();
    } else {
      // Create new
      [settings] = await db.insert(teamSettingsTable)
        .values({
          teamId: input.teamId,
          defaultRecipeVisibility: input.defaultRecipeVisibility,
        })
        .returning();
    }

    return { settings };
  });
```

## UI Changes

### Team Settings Page
**File:** `src/app/(settings)/settings/teams/[teamSlug]/settings/page.tsx` (create if doesn't exist)

```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDB } from "@/db";
import { teamTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionFromCookie } from "@/utils/auth";
import { RecipeVisibilitySettings } from "./_components/recipe-visibility-settings";
import { DefaultRecipeVisibilitySettings } from "./_components/default-recipe-visibility-settings";

interface TeamSettingsPageProps {
  params: Promise<{ teamSlug: string }>;
}

async function TeamSettingsContent({ teamSlug }: { teamSlug: string }) {
  const session = await getSessionFromCookie();
  if (!session) {
    notFound();
  }

  const db = getDB();
  const team = await db.query.teamTable.findFirst({
    where: eq(teamTable.slug, teamSlug),
    with: {
      settings: true,
    },
  });

  if (!team) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Settings</h1>
        <p className="text-muted-foreground">Manage settings for {team.name}</p>
      </div>

      <RecipeVisibilitySettings
        teamId={team.id}
        currentMode={team.settings?.recipeVisibilityMode || 'all'}
      />

      <DefaultRecipeVisibilitySettings
        teamId={team.id}
        currentVisibility={team.settings?.defaultRecipeVisibility || 'public'}
      />
    </div>
  );
}

export default async function TeamSettingsPage({ params }: TeamSettingsPageProps) {
  const { teamSlug } = await params;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamSettingsContent teamSlug={teamSlug} />
    </Suspense>
  );
}
```

### Recipe Visibility Settings Component
**File:** `src/app/(settings)/settings/teams/[teamSlug]/settings/_components/recipe-visibility-settings.tsx`

```tsx
"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateRecipeVisibilityModeAction } from "@/actions/team-settings.actions";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RecipeVisibilitySettingsProps {
  teamId: string;
  currentMode: 'all' | 'team_only';
}

export function RecipeVisibilitySettings({ teamId, currentMode }: RecipeVisibilitySettingsProps) {
  const [mode, setMode] = useState<'all' | 'team_only'>(currentMode);
  const [hasChanges, setHasChanges] = useState(false);

  const { execute, isPending, isSuccess } = useServerAction(updateRecipeVisibilityModeAction, {
    onSuccess: () => {
      toast.success("Recipe visibility settings updated");
      setHasChanges(false);
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update settings");
    },
  });

  const handleSave = () => {
    execute({ teamId, recipeVisibilityMode: mode });
  };

  const handleChange = (value: string) => {
    setMode(value as 'all' | 'team_only');
    setHasChanges(value !== currentMode);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe Visibility</CardTitle>
        <CardDescription>
          Control which recipes are visible to team members
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={mode} onValueChange={handleChange}>
          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold">All Public Recipes</span>
              <span className="text-sm text-muted-foreground">
                Show recipes owned by your team plus all public recipes from other teams.
                Best for discovering new recipes and collaboration.
              </span>
            </Label>
          </div>

          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="team_only" id="team_only" />
            <Label htmlFor="team_only" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold">Team Recipes Only</span>
              <span className="text-sm text-muted-foreground">
                Show only recipes owned by your team (regardless of visibility).
                Use when you want a curated, private recipe collection.
              </span>
            </Label>
          </div>
        </RadioGroup>

        {hasChanges && (
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSuccess && <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Default Recipe Visibility Settings Component
**File:** `src/app/(settings)/settings/teams/[teamSlug]/settings/_components/default-recipe-visibility-settings.tsx`

```tsx
"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateDefaultRecipeVisibilityAction } from "@/actions/team-settings.actions";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DefaultRecipeVisibilitySettingsProps {
  teamId: string;
  currentVisibility: 'public' | 'private' | 'unlisted';
}

export function DefaultRecipeVisibilitySettings({ teamId, currentVisibility }: DefaultRecipeVisibilitySettingsProps) {
  const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>(currentVisibility);
  const [hasChanges, setHasChanges] = useState(false);

  const { execute, isPending, isSuccess } = useServerAction(updateDefaultRecipeVisibilityAction, {
    onSuccess: () => {
      toast.success("Default recipe visibility updated");
      setHasChanges(false);
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update settings");
    },
  });

  const handleSave = () => {
    execute({ teamId, defaultRecipeVisibility: visibility });
  };

  const handleChange = (value: string) => {
    setVisibility(value as 'public' | 'private' | 'unlisted');
    setHasChanges(value !== currentVisibility);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Recipe Visibility</CardTitle>
        <CardDescription>
          Set the default visibility for new recipes created by your team
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={visibility} onValueChange={handleChange}>
          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="public" id="public" />
            <Label htmlFor="public" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold">Public</span>
              <span className="text-sm text-muted-foreground">
                Recipes are visible to all teams. Anyone can discover and view them.
              </span>
            </Label>
          </div>

          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="unlisted" id="unlisted" />
            <Label htmlFor="unlisted" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold">Unlisted</span>
              <span className="text-sm text-muted-foreground">
                Recipes are only accessible via direct link. Not shown in public listings.
              </span>
            </Label>
          </div>

          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="private" id="private" />
            <Label htmlFor="private" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold">Private</span>
              <span className="text-sm text-muted-foreground">
                Recipes are only visible to your team members. Maximum privacy.
              </span>
            </Label>
          </div>
        </RadioGroup>

        {hasChanges && (
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSuccess && <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Add Shadcn Radio Group Component
If not already installed:
```bash
npx shadcn@latest add radio-group
```

### Update Team Settings Navigation
Add link to recipe settings in team navigation/sidebar:

**File:** `src/app/(settings)/settings/teams/[teamSlug]/layout.tsx` or sidebar component

```tsx
<NavLink href={`/settings/teams/${team.slug}/settings`}>
  Settings
</NavLink>
```

## Recipe Creation Logic Update

When creating new recipes, use the team's default visibility setting:

**File:** `src/app/(dashboard)/recipes/recipes.actions.ts` (or wherever recipe creation is handled)

```typescript
export const createRecipeAction = createServerAction()
  .input(createRecipeSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session || !session.activeTeamId) {
      throw new ZSAError("UNAUTHORIZED", "Must be logged in with active team");
    }

    await requirePermission(session.user.id, session.activeTeamId, TEAM_PERMISSIONS.CREATE_RECIPES);

    const db = getDB();

    // Fetch team settings to get default visibility
    const teamSettings = await db.query.teamSettingsTable.findFirst({
      where: eq(teamSettingsTable.teamId, session.activeTeamId),
    });

    const defaultVisibility = teamSettings?.defaultRecipeVisibility || 'public';

    // Create recipe with default visibility (can be overridden if input has visibility)
    const [recipe] = await db.insert(recipesTable)
      .values({
        ...input,
        visibility: input.visibility ?? defaultVisibility, // Use input if provided, otherwise use team default
        teamId: session.activeTeamId,
      })
      .returning();

    return { recipe };
  });
```

**Note:** If the recipe creation form allows users to override the visibility, the input visibility should take precedence. Otherwise, use the team default.

## Implementation Checklist

### Phase 1: Database (Required)
- [ ] Add `teamSettingsTable` to `src/db/schema.ts`
- [ ] Add relations for team settings
- [ ] Export `TeamSettings` type
- [ ] Run `pnpm db:generate add-team-settings-table`
- [ ] Review generated migration
- [ ] Apply migration locally
- [ ] Seed existing teams with default settings
- [ ] Test locally with sample teams

### Phase 2: Helper Functions (Required)
- [ ] Create `src/utils/recipe-visibility.ts` with `getRecipeVisibilityConditions()`
- [ ] Create `src/actions/team-settings.actions.ts` with get/update actions
- [ ] Add `updateDefaultRecipeVisibilityAction` to team settings actions

### Phase 3: Update Recipe Queries (Critical)
- [ ] Update `getRecipesAction` in `recipes.actions.ts`
- [ ] Update `getRecipeByIdAction` in `recipes.actions.ts`
- [ ] Update `getRecipeMetadataAction` in `recipes.actions.ts`
- [ ] Update `createRecipeAction` to use team's default visibility setting
- [ ] Search for other recipe queries and update:
  - Week recipe queries
  - Recipe autocomplete/search components
  - Recipe dropdowns/selectors

### Phase 4: UI (User-Facing)
- [ ] Add shadcn radio-group component
- [ ] Create team settings page route structure
- [ ] Create `RecipeVisibilitySettings` component
- [ ] Create `DefaultRecipeVisibilitySettings` component
- [ ] Add navigation link to team settings
- [ ] Test settings UI with different visibility modes
- [ ] Test default visibility in recipe creation form

### Phase 5: Testing
- [ ] Test "all" mode: Verify public recipes from other teams are visible
- [ ] Test "team_only" mode: Verify only team recipes are visible
- [ ] Test recipe filtering with different settings
- [ ] Test permission checks (only team admins can edit settings)
- [ ] Test default behavior for teams without settings
- [ ] Test default visibility on recipe creation (public/private/unlisted)
- [ ] Test that user can override default visibility when creating recipe

### Phase 6: Deployment
- [ ] Apply migration to remote D1 database
- [ ] Seed remote teams with default settings
- [ ] Monitor for any query errors
- [ ] Update documentation

## Performance Considerations

### Query Optimization
- Team settings query adds one extra lookup per recipe query
- Consider caching team settings in session or KV store for frequently accessed teams
- Index on `teamSettingsTable.teamId` ensures fast lookups

### Caching Strategy (Optional Enhancement)
```typescript
// src/utils/team-settings-cache.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";

const CACHE_TTL = 60 * 60; // 1 hour

export async function getCachedTeamSettings(teamId: string) {
  const { env } = await getCloudflareContext();
  const kv = env.NEXT_INC_CACHE_KV;

  const cacheKey = `team_settings:${teamId}`;
  const cached = await kv.get(cacheKey, "json");

  if (cached) return cached;

  const db = getDB();
  const settings = await db.query.teamSettingsTable.findFirst({
    where: eq(teamSettingsTable.teamId, teamId),
  });

  if (settings) {
    await kv.put(cacheKey, JSON.stringify(settings), { expirationTtl: CACHE_TTL });
  }

  return settings;
}

export async function invalidateTeamSettingsCache(teamId: string) {
  const { env } = await getCloudflareContext();
  const kv = env.NEXT_INC_CACHE_KV;
  await kv.delete(`team_settings:${teamId}`);
}
```

## Future Enhancements

### Additional Settings
Once the team settings table exists, can easily add:
- Recipe creation defaults (default visibility, tags)
- Week scheduling preferences
- Grocery list defaults
- Notification preferences
- Feature flags per team

### Granular Visibility
Could add more options:
- `all_public`: All public recipes (current "all" mode)
- `all_public_and_unlisted`: Include unlisted recipes
- `team_and_shared`: Team recipes + explicitly shared recipes
- `team_only`: Only team recipes (current "team_only" mode)

### Recipe Sharing
Add explicit sharing between teams:
```typescript
export const recipeSharesTable = sqliteTable("recipe_shares", {
  id: text().primaryKey().$defaultFn(() => `rsh_${createId()}`).notNull(),
  recipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),
  sharedWithTeamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' }),
  sharedByUserId: text().notNull().references(() => userTable.id),
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});
```

## Migration Rollback Plan

If issues occur, can rollback:

```sql
-- Rollback: Drop team settings table
DROP TABLE IF EXISTS team_settings;

-- Restore original recipe query behavior by removing setting checks in code
```

## Testing Scenarios

### Test Case 1: All Mode (Default)
- Team A creates private recipe "Secret Sauce"
- Team A creates public recipe "Basic Pasta"
- Team B with mode="all" should see:
  - ✅ All Team B recipes (all visibilities)
  - ✅ "Basic Pasta" from Team A (public)
  - ❌ "Secret Sauce" from Team A (private)

### Test Case 2: Team Only Mode
- Team A creates public recipe "Popular Pizza"
- Team B sets mode="team_only"
- Team B should see:
  - ✅ All Team B recipes (all visibilities)
  - ❌ "Popular Pizza" from Team A (public, but filtered out)

### Test Case 3: Recipe Ownership
- Recipe belongs to Team A
- User from Team B (with mode="all") edits recipe
- Should fail with permission error (can view but not edit)

### Test Case 4: Settings Permission
- Regular member of Team A attempts to change settings
- Should fail unless user has EDIT_TEAM_SETTINGS permission
- Only admins/owners should succeed

### Test Case 5: Default Recipe Visibility - Public
- Team A sets defaultRecipeVisibility="public"
- User creates new recipe without specifying visibility
- Recipe should be created with visibility="public"
- Recipe should be visible to all teams

### Test Case 6: Default Recipe Visibility - Private
- Team A sets defaultRecipeVisibility="private"
- User creates new recipe without specifying visibility
- Recipe should be created with visibility="private"
- Recipe should only be visible to Team A members

### Test Case 7: Default Recipe Visibility - Unlisted
- Team A sets defaultRecipeVisibility="unlisted"
- User creates new recipe without specifying visibility
- Recipe should be created with visibility="unlisted"
- Recipe should be accessible via direct link but not shown in listings

### Test Case 8: Override Default Visibility
- Team A sets defaultRecipeVisibility="private"
- User explicitly creates recipe with visibility="public"
- Recipe should be created with visibility="public" (user override)
- Default should be ignored when user explicitly sets visibility

## Documentation Updates

After implementation, update:
- [ ] `CLAUDE.md` - Add team settings documentation
- [ ] User guide - How to configure team settings
- [ ] API documentation - New team settings endpoints
- [ ] Database schema documentation
