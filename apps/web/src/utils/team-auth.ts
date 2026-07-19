import "server-only";

import { getDB } from "@/db";
import { teamMembershipTable, teamRoleTable, SYSTEM_ROLES_ENUM, TEAM_PERMISSIONS } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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
      // Owner has ALL permissions
      return Object.values(TEAM_PERMISSIONS);
    case SYSTEM_ROLES_ENUM.ADMIN:
      // Admin has all permissions except DELETE_TEAM (reserved for owner)
      return [
        // Recipe permissions
        TEAM_PERMISSIONS.ACCESS_RECIPES,
        TEAM_PERMISSIONS.CREATE_RECIPES,
        TEAM_PERMISSIONS.EDIT_RECIPES,
        TEAM_PERMISSIONS.DELETE_RECIPES,
        // Schedule permissions
        TEAM_PERMISSIONS.ACCESS_SCHEDULES,
        TEAM_PERMISSIONS.CREATE_SCHEDULES,
        TEAM_PERMISSIONS.EDIT_SCHEDULES,
        TEAM_PERMISSIONS.DELETE_SCHEDULES,
        // Grocery template permissions
        TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.DELETE_GROCERY_TEMPLATES,
        // Team management permissions
        TEAM_PERMISSIONS.INVITE_MEMBERS,
        TEAM_PERMISSIONS.REMOVE_MEMBERS,
        TEAM_PERMISSIONS.CHANGE_MEMBER_ROLES,
        TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS,
        // Role management permissions
        TEAM_PERMISSIONS.CREATE_ROLES,
        TEAM_PERMISSIONS.EDIT_ROLES,
        TEAM_PERMISSIONS.DELETE_ROLES,
        TEAM_PERMISSIONS.ASSIGN_ROLES,
      ];
    case SYSTEM_ROLES_ENUM.MEMBER:
      // Member can create and edit (but not delete) resources
      return [
        TEAM_PERMISSIONS.ACCESS_RECIPES,
        TEAM_PERMISSIONS.CREATE_RECIPES,
        TEAM_PERMISSIONS.EDIT_RECIPES,
        TEAM_PERMISSIONS.ACCESS_SCHEDULES,
        TEAM_PERMISSIONS.CREATE_SCHEDULES,
        TEAM_PERMISSIONS.EDIT_SCHEDULES,
        TEAM_PERMISSIONS.ACCESS_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.CREATE_GROCERY_TEMPLATES,
        TEAM_PERMISSIONS.EDIT_GROCERY_TEMPLATES,
      ];
    case SYSTEM_ROLES_ENUM.GUEST:
      // Guest has read-only access
      return [
        TEAM_PERMISSIONS.ACCESS_RECIPES,
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
