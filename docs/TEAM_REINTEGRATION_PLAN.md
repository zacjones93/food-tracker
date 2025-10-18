# Team Re-Integration Plan

## Overview
Restore team/multi-tenancy logic to food-tracker app with scoped permissions for schedules and grocery templates. Recipe books remain public.

## Requirements
1. ✅ Teams with owner role (full CRUD on schedules & grocery templates)
2. ✅ Food schedules (weeks) scoped to teams
3. ✅ Grocery templates scoped to teams (EXCEPT default template)
4. ✅ Recipe books remain public (no team scoping)
5. ✅ Team invite system
6. ✅ Seed SQL with default team, user, and assignments

---

## Phase 1: Database Schema Changes

### 1.1 Add Team Tables
Restore team tables from commit `f649e81` with modifications:

**teamTable**
```typescript
id: text().primaryKey().$defaultFn(() => `team_${createId()}`)
name: text({ length: 255 }).notNull()
slug: text({ length: 255 }).notNull().unique()
description: text({ length: 1000 })
avatarUrl: text({ length: 600 })
...commonColumns
```

**teamMembershipTable**
```typescript
id: text().primaryKey().$defaultFn(() => `tmem_${createId()}`)
teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' })
userId: text().notNull().references(() => userTable.id, { onDelete: 'cascade' })
roleId: text().notNull()
isSystemRole: integer().default(1).notNull()
invitedBy: text().references(() => userTable.id)
joinedAt: integer({ mode: "timestamp" })
isActive: integer().default(1).notNull()
...commonColumns
```

**teamRoleTable**
```typescript
id: text().primaryKey().$defaultFn(() => `trole_${createId()}`)
teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' })
name: text({ length: 255 }).notNull()
description: text({ length: 1000 })
permissions: text({ mode: 'json' }).$type<string[]>().notNull()
metadata: text({ length: 5000 })
isEditable: integer().default(1).notNull()
...commonColumns
```

**teamInvitationTable**
```typescript
id: text().primaryKey().$defaultFn(() => `tinv_${createId()}`)
teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' })
email: text({ length: 255 }).notNull()
roleId: text().notNull()
isSystemRole: integer().default(1).notNull()
token: text({ length: 255 }).notNull().unique()
invitedBy: text().notNull().references(() => userTable.id)
expiresAt: integer({ mode: "timestamp" }).notNull()
acceptedAt: integer({ mode: "timestamp" })
acceptedBy: text().references(() => userTable.id)
...commonColumns
```

### 1.2 Add Foreign Keys to Existing Tables

**weeksTable** - Add teamId
```typescript
teamId: text().notNull().references(() => teamTable.id, { onDelete: 'cascade' })
```
Index: `index("weeks_team_idx").on(table.teamId)`

**groceryListTemplatesTable** - Add teamId (nullable for default)
```typescript
teamId: text().references(() => teamTable.id, { onDelete: 'cascade' })
isDefault: integer({ mode: 'boolean' }).default(false).notNull()
```
Indexes:
- `index("glt_team_idx").on(table.teamId)`
- `index("glt_default_idx").on(table.isDefault)`

### 1.3 Relations
```typescript
export const teamRelations = relations(teamTable, ({ many }) => ({
  memberships: many(teamMembershipTable),
  invitations: many(teamInvitationTable),
  roles: many(teamRoleTable),
  weeks: many(weeksTable),
  groceryTemplates: many(groceryListTemplatesTable),
}));

export const teamRoleRelations = relations(teamRoleTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamRoleTable.teamId],
    references: [teamTable.id],
  }),
}));

export const teamMembershipRelations = relations(teamMembershipTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamMembershipTable.teamId],
    references: [teamTable.id],
  }),
  user: one(userTable, {
    fields: [teamMembershipTable.userId],
    references: [userTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [teamMembershipTable.invitedBy],
    references: [userTable.id],
  }),
}));

export const teamInvitationRelations = relations(teamInvitationTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [teamInvitationTable.teamId],
    references: [teamTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [teamInvitationTable.invitedBy],
    references: [userTable.id],
  }),
  acceptedByUser: one(userTable, {
    fields: [teamInvitationTable.acceptedBy],
    references: [userTable.id],
  }),
}));

// Update existing relations
export const weeksRelations = relations(weeksTable, ({ many, one }) => ({
  recipes: many(weekRecipesTable),
  groceryItems: many(groceryItemsTable),
  team: one(teamTable, {
    fields: [weeksTable.teamId],
    references: [teamTable.id],
  }),
}));

export const groceryListTemplatesRelations = relations(groceryListTemplatesTable, ({ one }) => ({
  team: one(teamTable, {
    fields: [groceryListTemplatesTable.teamId],
    references: [teamTable.id],
  }),
}));

export const userRelations = relations(userTable, ({ many }) => ({
  teamMemberships: many(teamMembershipTable),
}));
```

### 1.4 Type Exports
```typescript
export type Team = InferSelectModel<typeof teamTable>;
export type TeamMembership = InferSelectModel<typeof teamMembershipTable>;
export type TeamRole = InferSelectModel<typeof teamRoleTable>;
export type TeamInvitation = InferSelectModel<typeof teamInvitationTable>;
```

---

## Phase 2: Permissions System

### 2.1 System Roles
```typescript
export const SYSTEM_ROLES_ENUM = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  GUEST: 'guest',
} as const;

export const systemRoleTuple = Object.values(SYSTEM_ROLES_ENUM) as [string, ...string[]];
```

### 2.2 Team Permissions
```typescript
export const TEAM_PERMISSIONS = {
  // Food Schedule permissions
  ACCESS_SCHEDULES: 'access_schedules',
  CREATE_SCHEDULES: 'create_schedules',
  EDIT_SCHEDULES: 'edit_schedules',
  DELETE_SCHEDULES: 'delete_schedules',

  // Grocery Template permissions
  ACCESS_GROCERY_TEMPLATES: 'access_grocery_templates',
  CREATE_GROCERY_TEMPLATES: 'create_grocery_templates',
  EDIT_GROCERY_TEMPLATES: 'edit_grocery_templates',
  DELETE_GROCERY_TEMPLATES: 'delete_grocery_templates',

  // Team management
  INVITE_MEMBERS: 'invite_members',
  REMOVE_MEMBERS: 'remove_members',
  CHANGE_MEMBER_ROLES: 'change_member_roles',
  EDIT_TEAM_SETTINGS: 'edit_team_settings',
  DELETE_TEAM: 'delete_team',

  // Role management (custom roles)
  CREATE_ROLES: 'create_roles',
  EDIT_ROLES: 'edit_roles',
  DELETE_ROLES: 'delete_roles',
  ASSIGN_ROLES: 'assign_roles',
} as const;
```

### 2.3 Default Role Permissions

**Owner** (full permissions):
```typescript
[
  'access_schedules', 'create_schedules', 'edit_schedules', 'delete_schedules',
  'access_grocery_templates', 'create_grocery_templates', 'edit_grocery_templates', 'delete_grocery_templates',
  'invite_members', 'remove_members', 'change_member_roles',
  'edit_team_settings', 'delete_team',
  'create_roles', 'edit_roles', 'delete_roles', 'assign_roles',
]
```

**Admin**:
```typescript
[
  'access_schedules', 'create_schedules', 'edit_schedules', 'delete_schedules',
  'access_grocery_templates', 'create_grocery_templates', 'edit_grocery_templates', 'delete_grocery_templates',
  'invite_members',
]
```

**Member**:
```typescript
[
  'access_schedules', 'create_schedules', 'edit_schedules',
  'access_grocery_templates', 'create_grocery_templates', 'edit_grocery_templates',
]
```

**Guest** (read-only):
```typescript
[
  'access_schedules',
  'access_grocery_templates',
]
```

---

## Phase 3: Authorization Utilities

### 3.1 Create `src/utils/team-auth.ts`
```typescript
import { getDB } from "@/db";
import { teamMembershipTable, teamRoleTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { SYSTEM_ROLES_ENUM, TEAM_PERMISSIONS } from "@/db/schema";

export async function getUserTeamMembership(userId: string, teamId: string) {
  const db = getDB();

  const membership = await db.query.teamMembershipTable.findFirst({
    where: and(
      eq(teamMembershipTable.userId, userId),
      eq(teamMembershipTable.teamId, teamId),
      eq(teamMembershipTable.isActive, 1)
    ),
  });

  return membership;
}

export async function getUserPermissions(userId: string, teamId: string): Promise<string[]> {
  const db = getDB();

  const membership = await getUserTeamMembership(userId, teamId);
  if (!membership) return [];

  // System role
  if (membership.isSystemRole) {
    return getSystemRolePermissions(membership.roleId);
  }

  // Custom role
  const role = await db.query.teamRoleTable.findFirst({
    where: eq(teamRoleTable.id, membership.roleId),
  });

  return role?.permissions ?? [];
}

export function getSystemRolePermissions(roleId: string): string[] {
  switch (roleId) {
    case SYSTEM_ROLES_ENUM.OWNER:
      return Object.values(TEAM_PERMISSIONS);
    case SYSTEM_ROLES_ENUM.ADMIN:
      return [
        TEAM_PERMISSIONS.ACCESS_SCHEDULES,
        TEAM_PERMISSIONS.CREATE_SCHEDULES,
        TEAM_PERMISSIONS.EDIT_SCHEDULES,
        TEAM_PERMISSIONS.DELETE_SCHEDULES,
        TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.DELETE_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.INVITE_MEMBERS,
      ];
    case SYSTEM_ROLES_ENUM.MEMBER:
      return [
        TEAM_PERMISSIONS.ACCESS_SCHEDULES,
        TEAM_PERMISSIONS.CREATE_SCHEDULES,
        TEAM_PERMISSIONS.EDIT_SCHEDULES,
        TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES,
      ];
    case SYSTEM_ROLES_ENUM.GUEST:
      return [
        TEAM_PERMISSIONS.ACCESS_SCHEDULES,
        TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES,
      ];
    default:
      return [];
  }
}

export async function hasPermission(
  userId: string,
  teamId: string,
  permission: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, teamId);
  return permissions.includes(permission);
}

export async function requirePermission(
  userId: string,
  teamId: string,
  permission: string
): Promise<void> {
  const allowed = await hasPermission(userId, teamId, permission);
  if (!allowed) {
    throw new Error(`FORBIDDEN: Missing permission ${permission}`);
  }
}
```

---

## Phase 4: Update Server Actions

### 4.1 Weeks Actions (`weeks.actions.ts`)
Add team scoping and permission checks:

**createWeekAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

// Require permission
await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.CREATE_SCHEDULES);

const [week] = await db.insert(weeksTable)
  .values({
    ...input,
    teamId: input.teamId,
  })
  .returning();
```

**updateWeekAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

// Get week to verify team ownership
const existingWeek = await db.query.weeksTable.findFirst({
  where: eq(weeksTable.id, input.id),
});

if (!existingWeek) throw new ZSAError("NOT_FOUND", "Week not found");

await requirePermission(user.id, existingWeek.teamId, TEAM_PERMISSIONS.EDIT_SCHEDULES);

const [week] = await db.update(weeksTable)
  .set(updateData)
  .where(eq(weeksTable.id, id))
  .returning();
```

**deleteWeekAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

const existingWeek = await db.query.weeksTable.findFirst({
  where: eq(weeksTable.id, input.id),
});

if (!existingWeek) throw new ZSAError("NOT_FOUND", "Week not found");

await requirePermission(user.id, existingWeek.teamId, TEAM_PERMISSIONS.DELETE_SCHEDULES);

await db.delete(weeksTable).where(eq(weeksTable.id, input.id));
```

**getWeeksAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

// Get user's team memberships
const memberships = await db.query.teamMembershipTable.findMany({
  where: and(
    eq(teamMembershipTable.userId, user.id),
    eq(teamMembershipTable.isActive, 1)
  ),
});

const teamIds = memberships.map(m => m.teamId);

// Only return weeks from user's teams
const weeks = await db.query.weeksTable.findMany({
  where: (weeks, { inArray }) => inArray(weeks.teamId, teamIds),
  orderBy: (weeks, { desc }) => [desc(weeks.startDate)],
  with: {
    recipes: {
      with: {
        recipe: true,
      },
      orderBy: (weekRecipes, { asc }) => [asc(weekRecipes.order)],
    },
  },
});
```

### 4.2 Grocery Template Actions (`grocery-templates.actions.ts`)

**createGroceryListTemplateAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES);

const [template] = await db.insert(groceryListTemplatesTable)
  .values({
    name: input.name,
    template: input.template,
    teamId: input.teamId,
    isDefault: false,
  })
  .returning();
```

**updateGroceryListTemplateAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

const existingTemplate = await db.query.groceryListTemplatesTable.findFirst({
  where: eq(groceryListTemplatesTable.id, input.id),
});

if (!existingTemplate) throw new ZSAError("NOT_FOUND", "Template not found");

// Cannot edit default template
if (existingTemplate.isDefault) {
  throw new ZSAError("FORBIDDEN", "Cannot edit default template");
}

await requirePermission(user.id, existingTemplate.teamId!, TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES);

const [template] = await db.update(groceryListTemplatesTable)
  .set(updateData)
  .where(eq(groceryListTemplatesTable.id, id))
  .returning();
```

**deleteGroceryListTemplateAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

const existingTemplate = await db.query.groceryListTemplatesTable.findFirst({
  where: eq(groceryListTemplatesTable.id, input.id),
});

if (!existingTemplate) throw new ZSAError("NOT_FOUND", "Template not found");

// Cannot delete default template
if (existingTemplate.isDefault) {
  throw new ZSAError("FORBIDDEN", "Cannot delete default template");
}

await requirePermission(user.id, existingTemplate.teamId!, TEAM_PERMISSIONS.DELETE_GROCERY_TEMPLATES);

await db.delete(groceryListTemplatesTable)
  .where(eq(groceryListTemplatesTable.id, input.id));
```

**getGroceryListTemplatesAction**
```typescript
const { user } = await getSessionFromCookie();
if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

// Get user's team memberships
const memberships = await db.query.teamMembershipTable.findMany({
  where: and(
    eq(teamMembershipTable.userId, user.id),
    eq(teamMembershipTable.isActive, 1)
  ),
});

const teamIds = memberships.map(m => m.teamId);

// Return templates from user's teams + default template
const templates = await db.query.groceryListTemplatesTable.findMany({
  where: (templates, { or, inArray, eq, isNull }) => or(
    inArray(templates.teamId, teamIds),
    eq(templates.isDefault, true)
  ),
  orderBy: (templates, { asc }) => [asc(templates.name)],
});
```

---

## Phase 5: Team Invite System

### 5.1 Create `src/actions/team-invites.actions.ts`
```typescript
"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { teamInvitationTable, teamMembershipTable } from "@/db/schema";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission, TEAM_PERMISSIONS } from "@/utils/team-auth";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

const createInviteSchema = z.object({
  teamId: z.string(),
  email: z.string().email(),
  roleId: z.string(),
  isSystemRole: z.boolean().default(true),
});

const acceptInviteSchema = z.object({
  token: z.string(),
});

const cancelInviteSchema = z.object({
  inviteId: z.string(),
});

export const createTeamInviteAction = createServerAction()
  .input(createInviteSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.INVITE_MEMBERS);

    const db = getDB();

    // Check for existing active invitation
    const existingInvite = await db.query.teamInvitationTable.findFirst({
      where: and(
        eq(teamInvitationTable.teamId, input.teamId),
        eq(teamInvitationTable.email, input.email),
        eq(teamInvitationTable.acceptedAt, null)
      ),
    });

    if (existingInvite && new Date(existingInvite.expiresAt) > new Date()) {
      throw new ZSAError("CONFLICT", "Active invitation already exists");
    }

    const token = `tinv_${createId()}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db.insert(teamInvitationTable)
      .values({
        teamId: input.teamId,
        email: input.email,
        roleId: input.roleId,
        isSystemRole: input.isSystemRole ? 1 : 0,
        token,
        invitedBy: user.id,
        expiresAt,
      })
      .returning();

    // TODO: Send invitation email with token

    return { invite };
  });

export const acceptTeamInviteAction = createServerAction()
  .input(acceptInviteSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    const invite = await db.query.teamInvitationTable.findFirst({
      where: eq(teamInvitationTable.token, input.token),
    });

    if (!invite) throw new ZSAError("NOT_FOUND", "Invitation not found");
    if (invite.acceptedAt) throw new ZSAError("CONFLICT", "Invitation already accepted");
    if (new Date(invite.expiresAt) < new Date()) {
      throw new ZSAError("FORBIDDEN", "Invitation expired");
    }
    if (invite.email !== user.email) {
      throw new ZSAError("FORBIDDEN", "Invitation email mismatch");
    }

    // Check if user is already a member
    const existingMembership = await db.query.teamMembershipTable.findFirst({
      where: and(
        eq(teamMembershipTable.teamId, invite.teamId),
        eq(teamMembershipTable.userId, user.id)
      ),
    });

    if (existingMembership) {
      throw new ZSAError("CONFLICT", "Already a member of this team");
    }

    // Create membership
    const [membership] = await db.insert(teamMembershipTable)
      .values({
        teamId: invite.teamId,
        userId: user.id,
        roleId: invite.roleId,
        isSystemRole: invite.isSystemRole,
        invitedBy: invite.invitedBy,
        joinedAt: new Date(),
        isActive: 1,
      })
      .returning();

    // Mark invitation as accepted
    await db.update(teamInvitationTable)
      .set({
        acceptedAt: new Date(),
        acceptedBy: user.id,
      })
      .where(eq(teamInvitationTable.id, invite.id));

    return { membership };
  });

export const cancelTeamInviteAction = createServerAction()
  .input(cancelInviteSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    const invite = await db.query.teamInvitationTable.findFirst({
      where: eq(teamInvitationTable.id, input.inviteId),
    });

    if (!invite) throw new ZSAError("NOT_FOUND", "Invitation not found");

    await requirePermission(user.id, invite.teamId, TEAM_PERMISSIONS.INVITE_MEMBERS);

    await db.delete(teamInvitationTable)
      .where(eq(teamInvitationTable.id, input.inviteId));

    return { success: true };
  });
```

---

## Phase 6: Seed Data

### 6.1 Create `scripts/seed-default-team.sql`
```sql
-- Create default team
INSERT INTO team (id, name, slug, description, createdAt, updatedAt, updateCounter)
VALUES (
  'team_default',
  'Default Team',
  'default',
  'Default team for food tracking',
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
);

-- Create default user (if not exists)
INSERT OR IGNORE INTO user (
  id,
  email,
  passwordHash,
  firstName,
  lastName,
  role,
  createdAt,
  updatedAt,
  updateCounter
)
VALUES (
  'usr_default',
  'default@foodtracker.local',
  -- Password hash for 'password123' (use proper Argon2 hash in production)
  '$argon2id$v=19$m=65536,t=3,p=4$...',
  'Default',
  'User',
  'user',
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
);

-- Create team membership (owner role)
INSERT INTO team_membership (
  id,
  teamId,
  userId,
  roleId,
  isSystemRole,
  joinedAt,
  isActive,
  createdAt,
  updatedAt,
  updateCounter
)
VALUES (
  'tmem_default',
  'team_default',
  'usr_default',
  'owner',
  1,
  strftime('%s', 'now'),
  1,
  strftime('%s', 'now'),
  strftime('%s', 'now'),
  0
);

-- Assign all existing weeks to default team
UPDATE weeks
SET teamId = 'team_default'
WHERE teamId IS NULL;

-- Create default grocery template (no team assignment)
INSERT OR IGNORE INTO grocery_list_templates (
  id,
  name,
  isDefault,
  template,
  createdAt,
  updatedAt
)
VALUES (
  'glt_default',
  'Default Grocery Template',
  1,
  '[{"category":"Produce","order":0,"items":[{"name":"Bananas","order":0},{"name":"Apples","order":1}]},{"category":"Meat","order":1,"items":[{"name":"Chicken","order":0}]},{"category":"Dairy","order":2,"items":[{"name":"Milk","order":0},{"name":"Eggs","order":1}]}]',
  strftime('%s', 'now'),
  strftime('%s', 'now')
);
```

---

## Phase 7: Database Migrations

### 7.1 Migration Steps
1. Update `src/db/schema.ts` with all team tables
2. Run `pnpm db:generate add-team-tables`
3. Review generated migration
4. Apply migration: `pnpm db:migrate:dev`
5. Run seed script: `sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/...db < scripts/seed-default-team.sql`

### 7.2 Migration Checklist
- [ ] Add team tables to schema
- [ ] Add teamId to weeksTable (NOT NULL)
- [ ] Add teamId to groceryListTemplatesTable (nullable)
- [ ] Add isDefault to groceryListTemplatesTable
- [ ] Generate migration
- [ ] Test migration locally
- [ ] Run seed script
- [ ] Verify all weeks assigned to default team
- [ ] Verify default template created

---

## Phase 8: Schema Updates

### 8.1 Update Zod Schemas

**week.schema.ts**
```typescript
export const createWeekSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2).max(255),
  emoji: z.string().max(10).optional(),
  status: z.enum(['current', 'upcoming', 'archived']).default('upcoming'),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  weekNumber: z.number().int().optional(),
});
```

**grocery-template.schema.ts**
```typescript
export const createGroceryListTemplateSchema = z.object({
  teamId: z.string(),
  name: z.string().min(2).max(255),
  template: z.array(groceryTemplateCategorySchema),
});
```

---

## Phase 9: Frontend Updates (Future)

### 9.1 Team Selector Component
- Dropdown in navigation to switch teams
- Show current team context

### 9.2 Settings/Profile - Team Management UI
Location: `/settings/profile` or `/settings/team`

**Team Information Section**
- Display current team name, slug, description
- Team avatar
- Edit team details (owner only)

**Team Members Section**
- List all team members with roles
- Remove members (owner/admin only)
- Change member roles (owner only)

**Invite Members Section**
- Email input + role selector
- Send invitation button (owner/admin with invite permission)
- List pending invitations
- Cancel invitation button

**My Teams Section**
- List all teams user is a member of
- Switch active team
- Leave team option (if not owner)

### 9.3 Permission-based UI
- Hide/disable actions based on user permissions
- Show owner-only features conditionally
- Disable edit/delete on default grocery template

---

## Implementation Order

1. ✅ **Phase 1**: Database schema changes (team tables, foreign keys)
2. ✅ **Phase 2**: Define permissions system (roles, permissions)
3. ✅ **Phase 3**: Create authorization utilities (`team-auth.ts`)
4. ✅ **Phase 4**: Update server actions (weeks, grocery templates)
5. ✅ **Phase 5**: Team invite system (actions)
6. ✅ **Phase 6**: Seed data (default team, user, assignments)
7. ✅ **Phase 7**: Run migrations and seed script
8. ✅ **Phase 8**: Update Zod schemas
9. ⏳ **Phase 9**: Frontend updates (team selector, invite UI)

---

## Testing Checklist

### Database
- [ ] Team tables created successfully
- [ ] Foreign keys on weeks and grocery templates
- [ ] Cascade deletes work correctly
- [ ] Default team and user seeded

### Permissions
- [ ] Owner can create/edit/delete schedules
- [ ] Owner can create/edit/delete grocery templates
- [ ] Member cannot delete schedules
- [ ] Guest can only view
- [ ] Default template cannot be edited/deleted
- [ ] Default template visible to all teams

### Team Invites
- [ ] Can create invitation
- [ ] Invitation expires after 7 days
- [ ] Cannot accept expired invitation
- [ ] Email must match invitation
- [ ] Duplicate memberships prevented
- [ ] Can cancel invitation

### Authorization
- [ ] User can only see weeks from their teams
- [ ] User can only see grocery templates from their teams + default
- [ ] Permission checks prevent unauthorized actions
- [ ] Recipe books remain public (no scoping)

---

## Rollback Plan

If issues arise:
1. Revert migration: `pnpm db:migrate:rollback`
2. Restore schema from commit `a960803`
3. Re-deploy without team logic

---

## Notes

- Recipe books intentionally remain public (no team scoping)
- Default grocery template has `teamId = NULL` and `isDefault = 1`
- All other templates must have a teamId
- System roles defined at application level (not DB)
- Custom roles stored in teamRoleTable with JSON permissions
- Cloudflare D1 limitation: NO TRANSACTIONS (handle failures gracefully)
- Use CUID2 for all IDs with prefixes (team_, tmem_, trole_, tinv_)

---

## Future Enhancements

1. Email notifications for invitations
2. Team analytics dashboard
3. Audit log for team actions
4. Team-level settings (timezone, preferences)
5. Transfer team ownership
6. Bulk member management
7. Integration with external calendars (team schedules)
