# Food Tracker Implementation Plan

## Executive Summary

Transform Cloudflare Workers Next.js SaaS template into a food tracking application by removing multi-tenancy/billing features and implementing Recipes and Weeks databases with a many-to-many relationship.

**Timeline Estimate:** 4-6 weeks for MVP
**Complexity:** Medium - Significant DB schema changes, moderate UI transformation

---

## Phase 1: Cleanup & Preparation (Week 1)

### 1.1 Remove SaaS Boilerplate

**Database Tables to Remove:**
- ✗ `creditTransactionTable` - No credit system needed
- ✗ `purchasedItemsTable` - No purchases

**Files/Features to Remove:**
```
src/app/(admin)/admin/               # Remove admin pages
src/app/(auth)/team-invite/          # Remove team invite flow
src/schemas/team-invite.schema.ts    # Remove team schemas
src/lib/stripe/                      # Remove billing integration (if exists)
src/components/**/credit-*           # Remove credit-related components
```

**Keep Essential Infrastructure:**
- ✓ `userTable` - Core user management
- ✓ Lucia Auth setup (simplified)
- ✓ Base layouts and UI components

**Remove Auth Complexity:**
- ✗ `passKeyCredentialTable` - Not needed for simple password auth
- ✗ Email verification flow - No email service
- ✗ Password reset flow - No email service
- ✗ Google SSO - Not needed for personal use
- ✗ Turnstile captcha - Overkill for personal project
- ✗ Email service dependencies

### 1.2 Simplify User System

**Modifications to `userTable`:**
```typescript
// Remove columns:
- credits: integer()              // Remove credit system
- googleId: text()                // Remove Google SSO
- emailVerified: integer()        // Remove email verification

// Keep:
- id: text().primaryKey()
- email: text().notNull().unique()
- firstName: text()
- lastName: text()
- passwordHash: text().notNull()  // Bcrypt/Argon2 hash
- avatar: text()
- createdAt: integer({ mode: 'timestamp' })
- updatedAt: integer({ mode: 'timestamp' })
- role: text()                    // Optional: 'user' | 'admin'
```

### 1.3 Simplify Authentication System

**Remove Auth Routes:**
```bash
rm -rf src/app/(auth)/verify-email/
rm -rf src/app/(auth)/reset-password/
rm -rf src/app/(auth)/forgot-password/
rm -rf src/app/(auth)/google/
```

**Remove Auth Actions:**
```bash
# Remove or simplify in auth actions files:
- Email verification actions
- Password reset actions
- Google OAuth actions
- Passkey credential actions
```

**Simplify to Basic Email/Password:**

**File:** `src/app/(auth)/sign-up/signup.actions.ts`
```typescript
import { hash } from '@node-rs/argon2';  // or bcrypt
import { createId } from '@paralleldrive/cuid2';

export const signUpAction = authenticatedAction
  .schema(signUpSchema)
  .handler(async ({ input }) => {
    const { email, password, firstName, lastName } = input;

    // Check if user exists
    const existingUser = await db.query.userTable.findFirst({
      where: eq(userTable.email, email)
    });
    if (existingUser) throw new Error('Email already in use');

    // Hash password
    const passwordHash = await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1
    });

    // Create user
    const userId = `usr_${createId()}`;
    await db.insert(userTable).values({
      id: userId,
      email,
      firstName,
      lastName,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create session immediately (no email verification)
    const session = await lucia.createSession(userId, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    cookies().set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );

    return { success: true };
  });
```

**File:** `src/app/(auth)/sign-in/signin.actions.ts`
```typescript
import { verify } from '@node-rs/argon2';

export const signInAction = unauthenticatedAction
  .schema(signInSchema)
  .handler(async ({ input }) => {
    const { email, password } = input;

    // Find user
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.email, email)
    });
    if (!user || !user.passwordHash) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const validPassword = await verify(user.passwordHash, password);
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    // Create session
    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    cookies().set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );

    return { success: true };
  });
```

**Update Validation Schemas:**

**File:** `src/schemas/auth.schema.ts`
```typescript
export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(255),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
```

**Dependencies to Add:**
```bash
pnpm add @node-rs/argon2
# Or use bcrypt:
# pnpm add bcryptjs @types/bcryptjs
```

**Security Best Practices:**
- ✓ Use Argon2id for password hashing (better than bcrypt)
- ✓ Never store passwords in plain text
- ✓ Use generic error messages ("Invalid email or password" not "Email not found")
- ✓ Implement rate limiting for login attempts (optional for personal use)
- ✓ Use HTTPS in production (automatic with Cloudflare Workers)
- ✓ Secure session cookies with httpOnly, secure, sameSite flags

### 1.4 Environment Cleanup

**Update `.env` and `.dev.vars`:**
- Remove Stripe keys (if present)
- Remove Email service configs (Resend, SendGrid, etc.)
- Remove Google OAuth configs
- Remove Turnstile configs (not needed for personal use)
- Keep D1 database binding
- Keep KV namespace for sessions

---

## Phase 2: Database Schema Implementation (Week 2)

### 2.1 Create Recipes Table

**File:** `src/db/schema.ts`

```typescript
export const recipesTable = sqliteTable("recipes", {
  ...commonColumns,  // id, createdAt, updatedAt
  id: text().primaryKey().$defaultFn(() => `rcp_${createId()}`).notNull(),

  // Core fields
  name: text({ length: 500 }).notNull(),
  emoji: text({ length: 10 }),  // Recipe icon

  // Metadata
  tags: text({ mode: 'json' }).$type<string[]>(),  // JSON array of tags
  mealType: text({ length: 50 }),  // "Lunch", "Dinner", "Breakfast"
  difficulty: text({ length: 20 }),  // "Easy", "Medium", "Hard"

  // Tracking
  lastMadeDate: integer({ mode: 'timestamp' }),
  mealsEatenCount: integer().default(0).notNull(),

  // Content (stored in page body, not DB)
  // - ingredients list (markdown)
  // - instructions (markdown)

  // Relations handled separately
}, (table) => ({
  nameIdx: index("recipes_name_idx").on(table.name),
}));

export const recipesRelations = relations(recipesTable, ({ many }) => ({
  weeks: many(weekRecipesTable),
  sideRecipes: many(recipeRelationsTable, { relationName: "mainRecipe" }),
  mainRecipes: many(recipeRelationsTable, { relationName: "sideRecipe" }),
}));
```

### 2.2 Create Weeks Table

```typescript
export const weeksTable = sqliteTable("weeks", {
  ...commonColumns,
  id: text().primaryKey().$defaultFn(() => `wk_${createId()}`).notNull(),

  name: text({ length: 255 }).notNull(),  // "Oct 14th - 19th, 2025"
  emoji: text({ length: 10 }),

  status: text({ length: 50 }).notNull().default('upcoming'),
  // Values: "current", "upcoming", "archived"

  startDate: integer({ mode: 'timestamp' }),
  endDate: integer({ mode: 'timestamp' }),

  weekNumber: integer(),  // Numeric identifier if needed

  // Grocery list stored as page content (markdown checklist)
}, (table) => ({
  statusIdx: index("weeks_status_idx").on(table.status),
  startDateIdx: index("weeks_start_date_idx").on(table.startDate),
}));

export const weeksRelations = relations(weeksTable, ({ many }) => ({
  recipes: many(weekRecipesTable),
}));
```

### 2.3 Create Junction Tables

```typescript
// Many-to-many: Weeks ↔ Recipes
export const weekRecipesTable = sqliteTable("week_recipes", {
  id: text().primaryKey().$defaultFn(() => `wr_${createId()}`).notNull(),
  weekId: text().notNull().references(() => weeksTable.id, { onDelete: 'cascade' }),
  recipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),

  order: integer().default(0),  // Display order in week
  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  weekIdx: index("wr_week_idx").on(table.weekId),
  recipeIdx: index("wr_recipe_idx").on(table.recipeId),
  uniqueWeekRecipe: index("wr_unique_idx").on(table.weekId, table.recipeId),
}));

export const weekRecipesRelations = relations(weekRecipesTable, ({ one }) => ({
  week: one(weeksTable, {
    fields: [weekRecipesTable.weekId],
    references: [weeksTable.id],
  }),
  recipe: one(recipesTable, {
    fields: [weekRecipesTable.recipeId],
    references: [recipesTable.id],
  }),
}));

// Self-referencing: Recipe ↔ Recipe (sides/accompaniments)
export const recipeRelationsTable = sqliteTable("recipe_relations", {
  id: text().primaryKey().$defaultFn(() => `rr_${createId()}`).notNull(),
  mainRecipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),
  sideRecipeId: text().notNull().references(() => recipesTable.id, { onDelete: 'cascade' }),

  createdAt: integer({ mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  mainIdx: index("rr_main_idx").on(table.mainRecipeId),
  sideIdx: index("rr_side_idx").on(table.sideRecipeId),
}));

export const recipeRelationsRelations = relations(recipeRelationsTable, ({ one }) => ({
  mainRecipe: one(recipesTable, {
    fields: [recipeRelationsTable.mainRecipeId],
    references: [recipesTable.id],
    relationName: "mainRecipe",
  }),
  sideRecipe: one(recipesTable, {
    fields: [recipeRelationsTable.sideRecipeId],
    references: [recipesTable.id],
    relationName: "sideRecipe",
  }),
}));
```

### 2.4 Database Migrations

```bash
# Generate migration
pnpm db:generate

# Run migration locally
pnpm db:migrate:dev

# Run migration on production
pnpm db:migrate:prod
```

---

## Phase 3: Backend Implementation (Week 3)

### 3.1 Create Server Actions

**File:** `src/app/(dashboard)/recipes/recipes.actions.ts`

```typescript
// CRUD operations for recipes
export const createRecipeAction = authenticatedAction(...)
export const updateRecipeAction = authenticatedAction(...)
export const deleteRecipeAction = authenticatedAction(...)
export const getRecipesAction = authenticatedAction(...)
export const getRecipeByIdAction = authenticatedAction(...)
export const incrementMealsEatenAction = authenticatedAction(...)
```

**File:** `src/app/(dashboard)/schedule/weeks.actions.ts`

```typescript
// CRUD for weeks
export const createWeekAction = authenticatedAction(...)
export const updateWeekAction = authenticatedAction(...)
export const deleteWeekAction = authenticatedAction(...)
export const getWeeksAction = authenticatedAction(...)
export const getWeekByIdAction = authenticatedAction(...)

// Manage week-recipe associations
export const addRecipeToWeekAction = authenticatedAction(...)
export const removeRecipeFromWeekAction = authenticatedAction(...)
export const reorderWeekRecipesAction = authenticatedAction(...)
```

### 3.2 Create Zod Validation Schemas

**File:** `src/schemas/recipe.schema.ts`

```typescript
export const createRecipeSchema = z.object({
  name: z.string().min(2).max(500),
  emoji: z.string().max(10).optional(),
  tags: z.array(z.string()).optional(),
  mealType: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']).optional(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
  content: z.string().optional(),  // Markdown content
});
```

**File:** `src/schemas/week.schema.ts`

```typescript
export const createWeekSchema = z.object({
  name: z.string().min(2).max(255),
  emoji: z.string().max(10).optional(),
  status: z.enum(['current', 'upcoming', 'archived']).default('upcoming'),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  groceryList: z.string().optional(),  // Markdown checklist
});
```

---

## Phase 4: Frontend Implementation (Week 4-5)

### 4.1 Route Structure Transformation

**Remove:**
```
src/app/(admin)/                    # Delete admin section
src/app/(marketing)/                # Simplify or replace with landing
```

**Create:**
```
src/app/(dashboard)/
  ├── schedule/                     # Week board view (replaces dashboard)
  │   ├── page.tsx                 # Board view grouped by status
  │   └── [weekId]/
  │       └── page.tsx             # Week detail with grocery list
  ├── recipes/
  │   ├── page.tsx                 # All recipes table view
  │   ├── [recipeId]/
  │   │   └── page.tsx             # Recipe detail page
  │   └── new/
  │       └── page.tsx             # Create recipe form
  └── settings/                     # Keep existing user settings
```

### 4.2 Week Board View Component

**File:** `src/app/(dashboard)/schedule/page.tsx`

**Features:**
- Kanban board with 3 columns: Current, Upcoming, Archived
- Drag-and-drop to change week status
- Click week card to view details
- Show recipe count and thumbnails in each card
- Create new week button

**Tech:**
- `@dnd-kit/core` for drag-and-drop
- Server actions for status updates
- Optimistic updates with React Query or SWR

### 4.3 Week Detail Page

**File:** `src/app/(dashboard)/schedule/[weekId]/page.tsx`

**Layout:**
```
┌─────────────────────────────────────┐
│ 🎃 Oct 14th - 19th, 2025            │
│ Status: [Current ▼]                 │
├─────────────────────────────────────┤
│ Our Recipes (8)                     │
│ ┌─────────────────────────────────┐ │
│ │ 🐔 Cracklin Chicken              │ │
│ │ 🥔 Salt & Vinegar Potatoes       │ │
│ │ [+ Add Recipe]                   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Grocery List                        │
│ ┌─────────────────────────────────┐ │
│ │ ## Meat                          │ │
│ │ - [ ] eggs                       │ │
│ │ - [ ] bacon - 2x                 │ │
│ │                                  │ │
│ │ ## Veggies / Herbs              │ │
│ │ - [ ] bananas                    │ │
│ │ [Edit markdown]                  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Components:**
- Recipe selector/autocomplete (Shadcn Combobox)
- Markdown editor for grocery list (Simple textarea or MDX editor)
- Checklist renderer with checkbox interactions

### 4.4 Recipes Table View

**File:** `src/app/(dashboard)/recipes/page.tsx`

**Features:**
- Sortable/filterable table (use Tanstack Table)
- Columns: Name, Meal Type, Tags, Meals Eaten, Last Made, Actions
- Filters: Meal type, tags, search
- Views switcher: All Recipes, Most Popular, This Week
- Click row to navigate to recipe detail

**Use existing template patterns:**
- `UsersTable` component as reference
- Shadcn Table + Data Table components
- `nuqs` for URL state management

### 4.5 Recipe Detail Page

**File:** `src/app/(dashboard)/recipes/[recipeId]/page.tsx`

**Layout:**
```
┌─────────────────────────────────────┐
│ 🐔 Cracklin Chicken                 │
│ Meal: Lunch | Tags: Chicken, Easy   │
│ Meals Eaten: 61 | Created: Oct 2021 │
├─────────────────────────────────────┤
│ Sides: 🥔 Salt & Vinegar Potatoes   │
│ Weeks: Oct 14-19, Oct 20-26 (+ 45)  │
├─────────────────────────────────────┤
│ Ingredients                         │
│ • 4 chicken thighs                  │
│ • Salt, pepper                      │
│                                     │
│ Instructions                        │
│ 1. Season chicken...                │
└─────────────────────────────────────┘
```

**Features:**
- Edit mode toggle
- Markdown content editor
- Link to side recipes
- Show associated weeks (with navigation)
- Increment meals eaten button

### 4.6 Navigation & Layout Updates

**Update:** `src/layouts/DashboardLayout.tsx` (or similar)

**Navigation items:**
```typescript
const navItems = [
  { href: '/schedule', label: 'Food Schedule', icon: CalendarIcon },
  { href: '/recipes', label: 'Recipes', icon: BookIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];
```

**Remove:**
- Credits display
- Team switcher
- Admin link

---

## Phase 5: UI Components & Polish (Week 5-6)

### 5.1 Reusable Components to Build

**File:** `src/components/recipes/recipe-card.tsx`
- Display recipe with emoji, name, metadata
- Quick actions: Edit, Delete, Add to Week

**File:** `src/components/recipes/recipe-selector.tsx`
- Autocomplete search for recipes
- Filter by meal type, tags
- Use Shadcn Combobox

**File:** `src/components/weeks/week-card.tsx`
- Board card showing week info
- Recipe list preview
- Drag handle for reordering

**File:** `src/components/weeks/grocery-list-editor.tsx`
- Markdown editor with preview
- Parse checkboxes for interactive list
- Category collapsing

**File:** `src/components/recipes/meal-counter-badge.tsx`
- Display meals eaten count
- Increment button with animation

### 5.2 State Management

**Use existing patterns:**
- Server actions with `zsa-react`
- Optimistic updates
- `useConfigStore` pattern for app-wide state (if needed)

**Consider adding:**
- Recipe filter state (URL-based with `nuqs`)
- Board view state (local or URL)

### 5.3 Styling & UX

**Keep:**
- Existing Shadcn UI components
- Tailwind CSS setup
- Dark mode support (if present)

**Add/Customize:**
- Color palette for recipe categories
- Emoji picker component (optional, can use native input)
- Skeleton loaders for async data
- Empty states for no recipes/weeks

---

## Phase 6: Data Migration & Seeding (Week 6)

### 6.1 Seed Script

**File:** `src/db/seed.ts`

```typescript
// Create example recipes
const recipes = [
  { name: "Cracklin Chicken", emoji: "🐔", mealType: "Lunch", mealsEaten: 61 },
  { name: "Greek Meatballs", emoji: "🥙", mealType: "Dinner", mealsEaten: 25 },
  // ... 10-20 example recipes
];

// Create example weeks
const weeks = [
  { name: "Oct 14th - 19th, 2025", status: "current", emoji: "🎃" },
  { name: "Oct 20th - 26th, 2025", status: "upcoming", emoji: "🎃" },
];

// Link recipes to weeks
```

**Run:** `pnpm db:seed`

### 6.2 Import from Notion (Optional)

**File:** `scripts/import-from-notion.ts`

If you have Notion API access, create script to:
1. Export Notion databases to JSON
2. Parse recipes and weeks
3. Insert into D1 database
4. Handle relations

---

## Phase 7: Testing & Deployment (Week 6)

### 7.1 Testing Checklist

**Manual Testing:**
- [ ] Create/edit/delete recipe
- [ ] Create/edit/delete week
- [ ] Add/remove recipes from week
- [ ] Edit grocery list
- [ ] Filter/sort recipes table
- [ ] Board view drag-and-drop
- [ ] Recipe detail page navigation
- [ ] Meals eaten counter
- [ ] Sign up with email/password
- [ ] Sign in with email/password
- [ ] Sign out
- [ ] Session persistence across page refreshes

**Edge Cases:**
- [ ] Empty states (no recipes, no weeks)
- [ ] Very long recipe names
- [ ] Large grocery lists
- [ ] Many recipes in one week (>20)

### 7.2 Performance Optimization

- [ ] Add database indexes (already in schema)
- [ ] Implement pagination for recipes (if >100)
- [ ] Optimize recipe images (if added)
- [ ] Cache frequently accessed data

### 7.3 Deployment

```bash
# Build and deploy
pnpm build
pnpm deploy

# Run production migrations
pnpm db:migrate:prod
```

**Verify:**
- [ ] D1 database accessible
- [ ] KV sessions working
- [ ] Auth flows functional
- [ ] No console errors

---

## Optional Enhancements (Post-MVP)

### Feature Ideas:
1. **Auto-generate grocery lists** from recipe ingredients
   - Add ingredients field to recipes
   - Aggregate ingredients across week recipes
   - Deduplicate and sum quantities

2. **Recipe import from URL**
   - Parse recipe websites
   - Extract ingredients and instructions
   - Use LLM for standardization

3. **Meal planning AI assistant**
   - Suggest recipes based on preferences
   - Balance nutrition across week
   - Avoid repeats

4. **Shopping list export**
   - Print view for grocery list
   - Mobile-optimized checklist
   - Export to iOS Reminders/Google Keep

5. **Multi-user support (later)**
   - Re-enable teams for household sharing
   - Permissions for editing recipes
   - Collaborative grocery lists

6. **Recipe ratings & notes**
   - Star rating system
   - Preparation notes/modifications
   - Cooking time tracking

7. **Calendar integration**
   - iCal export of meal schedule
   - Google Calendar sync
   - Meal reminders

8. **Recipe photos**
   - Image upload to Cloudflare Images
   - Gallery view for recipes
   - Camera integration for mobile

---

## File Deletion Checklist

### Critical Deletions (Do First):

```bash
# Database schema cleanup
# In src/db/schema.ts, remove these table definitions:
- creditTransactionTable
- purchasedItemsTable
- teamTable
- teamMembershipTable
- teamRoleTable
- teamInvitationTable

# Auth/Pages cleanup
rm -rf src/app/(admin)/
rm -rf src/app/(auth)/team-invite/
rm -rf src/app/(auth)/verify-email/
rm -rf src/app/(auth)/reset-password/
rm -rf src/app/(auth)/forgot-password/
rm -rf src/app/(auth)/google/

# Schema cleanup
rm src/schemas/team-invite.schema.ts

# Remove passkey table from schema
# In src/db/schema.ts, remove:
- passKeyCredentialTable

# Actions cleanup (search for team/credit references)
# Find and remove:
- Team-related actions
- Credit-related actions
- Purchase-related actions

# Component cleanup (if they exist)
# Find and remove:
- src/components/**/team-*
- src/components/**/credit-*
- src/components/**/billing-*

# Update user table
# In src/db/schema.ts, modify userTable:
- Remove credits column
- Simplify role if not needed
```

### References to Update:

**Search codebase for:**
- `teamTable` → Remove all references
- `creditTransaction` → Remove all references
- `purchasedItems` → Remove all references
- `/admin` routes → Remove from navigation
- Team-related schemas → Remove imports

**Update files:**
- Navigation components → Remove admin/team links
- User dashboard → Remove credit displays
- Settings pages → Remove team settings tab

---

## Dependencies to Review

### Keep:
```json
{
  "@lucia-auth/adapter-sqlite": "^3.0.2",
  "@paralleldrive/cuid2": "^2.2.2",
  "drizzle-orm": "^0.36.4",
  "lucia": "^3.2.2",
  "next": "15.0.3",
  "react": "19.0.0",
  "zod": "^3.23.8"
}
```

### Remove (not needed for simplified auth):
```json
{
  "stripe": "...",              // Billing not needed
  "@simplewebauthn/...": "...", // Passkey auth not needed
  "resend": "...",              // Email service not needed
  "@react-email/...": "..."     // Email templates not needed
}
```

### Add:
```json
{
  "@node-rs/argon2": "^1.8.0",         // Password hashing
  "@dnd-kit/core": "^6.1.0",           // Drag and drop
  "@dnd-kit/sortable": "^8.0.0",       // Sortable lists
  "@tanstack/react-table": "^8.11.0",  // Data tables
  "react-markdown": "^9.0.0",          // Markdown rendering
  "remark-gfm": "^4.0.0"               // GitHub flavored markdown
}
```

---

## Risk Assessment

### High Risk:
- **Database migration errors** → Backup D1 before schema changes
- **Breaking auth flows** → Test thoroughly after cleanup

### Medium Risk:
- **Missing dependencies** → Carefully review what teams/billing used
- **Type errors after deletion** → Run TypeScript check frequently

### Low Risk:
- **UI inconsistencies** → Template UI components are modular

---

## Success Metrics

### MVP Complete When:
- [ ] Can create/view/edit recipes
- [ ] Can create/view/edit weeks
- [ ] Board view shows weeks by status
- [ ] Can link recipes to weeks
- [ ] Can edit grocery lists
- [ ] Simple email/password auth works (signup/login/logout)
- [ ] Sessions persist in KV storage
- [ ] Deployed to Cloudflare Workers
- [ ] No template boilerplate visible (teams/credits/email verification)

### Production Ready When:
- [ ] 50+ recipes seeded
- [ ] Multiple weeks created
- [ ] No errors in production logs
- [ ] Performance <100ms for queries
- [ ] Mobile responsive
- [ ] Data backup strategy in place

---

## Timeline Summary

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | Cleanup | Template stripped of SaaS features |
| 2 | Database | Schema created, migrated, seeded |
| 3 | Backend | Server actions and validations complete |
| 4 | Frontend | Routes and basic UI functional |
| 5 | Components | Polished UI with all features |
| 6 | Testing | MVP deployed and tested |

**Total:** 6 weeks to MVP
**Optional enhancements:** +2-4 weeks per feature

---

## Next Steps

1. **Clone template:** `git clone https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template food-tracker`
2. **Run setup:** Follow template README
3. **Create new branch:** `git checkout -b remove-saas-boilerplate`
4. **Start Phase 1:** Begin systematic deletion of SaaS features
5. **Commit frequently:** Small, atomic commits for easy rollback

**First Command:**
```bash
git clone https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template food-tracker
cd food-tracker
pnpm install
```

---

## Questions to Resolve

Before starting, decide:
1. **Multi-user:** ✓ DECIDED - Single-user
   - Remove all team features

2. **Google SSO:** ✓ DECIDED - Remove
   - Simpler auth, no external dependencies

3. **Admin features:** ✓ DECIDED - No admin panel
   - Remove entirely for personal use

4. **Email verification:** ✓ DECIDED - Remove
   - No email service needed
   - Immediate login after signup

5. **Grocery automation:** MVP or later?
   - MVP → Add ingredients to recipe schema now
   - Later → Keep grocery lists manual

6. **Recipe content:** Separate fields or markdown?
   - Fields → Better structured, harder to edit
   - Markdown → Flexible, simpler to implement

**Recommendation:** Start with manual grocery lists, markdown content, email/password auth with Argon2 hashing. Add complexity later.
