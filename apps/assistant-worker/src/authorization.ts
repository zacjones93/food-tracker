import type { AssistantRequestContext } from "./context";

export const ASSISTANT_TEAM_PERMISSIONS = {
  accessRecipes: "access_recipes",
  createRecipes: "create_recipes",
  editRecipes: "edit_recipes",
  deleteRecipes: "delete_recipes",
  accessSchedules: "access_schedules",
  createSchedules: "create_schedules",
  editSchedules: "edit_schedules",
  deleteSchedules: "delete_schedules",
  accessGroceryTemplates: "access_grocery_templates",
  createGroceryTemplates: "create_grocery_templates",
  editGroceryTemplates: "edit_grocery_templates",
  deleteGroceryTemplates: "delete_grocery_templates",
  editTeamSettings: "edit_team_settings",
} as const;

export type AssistantTeamPermission =
  (typeof ASSISTANT_TEAM_PERMISSIONS)[keyof typeof ASSISTANT_TEAM_PERMISSIONS];

const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly AssistantTeamPermission[]> = {
  owner: Object.values(ASSISTANT_TEAM_PERMISSIONS),
  admin: Object.values(ASSISTANT_TEAM_PERMISSIONS),
  member: [
    ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
    ASSISTANT_TEAM_PERMISSIONS.createRecipes,
    ASSISTANT_TEAM_PERMISSIONS.editRecipes,
    ASSISTANT_TEAM_PERMISSIONS.accessSchedules,
    ASSISTANT_TEAM_PERMISSIONS.createSchedules,
    ASSISTANT_TEAM_PERMISSIONS.editSchedules,
    ASSISTANT_TEAM_PERMISSIONS.accessGroceryTemplates,
    ASSISTANT_TEAM_PERMISSIONS.createGroceryTemplates,
    ASSISTANT_TEAM_PERMISSIONS.editGroceryTemplates,
  ],
  guest: [
    ASSISTANT_TEAM_PERMISSIONS.accessRecipes,
    ASSISTANT_TEAM_PERMISSIONS.accessSchedules,
    ASSISTANT_TEAM_PERMISSIONS.accessGroceryTemplates,
  ],
};

interface MembershipRow {
  isSystemRole: number;
  permissions: string | null;
  roleId: string;
}

function parsePermissions(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((permission): permission is string => typeof permission === "string")
      : [];
  } catch {
    return [];
  }
}

export async function getAssistantTeamPermissions({
  db,
  context,
}: {
  db: D1Database;
  context: AssistantRequestContext;
}): Promise<Set<string>> {
  const membership = await db.prepare(
    `SELECT tm.roleId, tm.isSystemRole, tr.permissions
       FROM team_membership tm
       LEFT JOIN team_role tr
         ON tr.id = tm.roleId AND tr.teamId = tm.teamId
      WHERE tm.userId = ? AND tm.teamId = ? AND tm.isActive = 1
      LIMIT 1`,
  ).bind(context.userId, context.teamId).first<MembershipRow>();

  if (!membership) return new Set();
  if (membership.isSystemRole === 1) {
    return new Set(SYSTEM_ROLE_PERMISSIONS[membership.roleId] ?? []);
  }
  return new Set(parsePermissions(membership.permissions));
}

export async function assertAssistantTeamPermission({
  db,
  context,
  permission,
}: {
  db: D1Database;
  context: AssistantRequestContext;
  permission: AssistantTeamPermission;
}): Promise<void> {
  const permissions = await getAssistantTeamPermissions({ db, context });
  if (!permissions.has(permission)) {
    throw new Error(`Not authorized for ${permission} in the active team`);
  }
}
