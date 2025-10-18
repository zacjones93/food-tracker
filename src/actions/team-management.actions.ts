"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import {
  teamTable,
  teamMembershipTable,
  teamInvitationTable,
  TEAM_PERMISSIONS,
} from "@/db/schema";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
import { eq, and, isNull } from "drizzle-orm";

// Get all teams user is a member of
export const getUserTeamsAction = createServerAction()
  .handler(async () => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    const memberships = await db.query.teamMembershipTable.findMany({
      where: and(
        eq(teamMembershipTable.userId, user.id),
        eq(teamMembershipTable.isActive, 1)
      ),
      with: {
        team: true,
      },
    });

    return {
      teams: memberships.map((m) => ({
        ...m.team,
        roleId: m.roleId,
        isSystemRole: m.isSystemRole,
        joinedAt: m.joinedAt,
      })),
    };
  });

// Get team members
const getTeamMembersSchema = z.object({
  teamId: z.string(),
});

export const getTeamMembersAction = createServerAction()
  .input(getTeamMembersSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Verify user is a member of the team
    const membership = await db.query.teamMembershipTable.findFirst({
      where: and(
        eq(teamMembershipTable.userId, user.id),
        eq(teamMembershipTable.teamId, input.teamId),
        eq(teamMembershipTable.isActive, 1)
      ),
    });

    if (!membership) {
      throw new ZSAError("FORBIDDEN", "You are not a member of this team");
    }

    const members = await db.query.teamMembershipTable.findMany({
      where: and(
        eq(teamMembershipTable.teamId, input.teamId),
        eq(teamMembershipTable.isActive, 1)
      ),
      with: {
        user: true,
        invitedByUser: true,
      },
    });

    return { members };
  });

// Get pending invitations for a team
const getTeamInvitationsSchema = z.object({
  teamId: z.string(),
});

export const getTeamInvitationsAction = createServerAction()
  .input(getTeamInvitationsSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Verify user has permission to view invitations
    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.INVITE_MEMBERS);

    const invitations = await db.query.teamInvitationTable.findMany({
      where: and(
        eq(teamInvitationTable.teamId, input.teamId),
        // Get only pending invitations (not accepted)
      ),
      with: {
        invitedByUser: true,
      },
    });

    // Filter to only non-accepted invitations
    const pendingInvitations = invitations.filter((inv) => !inv.acceptedAt);

    return { invitations: pendingInvitations };
  });

// Remove team member
const removeMemberSchema = z.object({
  teamId: z.string(),
  membershipId: z.string(),
});

export const removeTeamMemberAction = createServerAction()
  .input(removeMemberSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Verify user has permission to remove members
    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.REMOVE_MEMBERS);

    const membership = await db.query.teamMembershipTable.findFirst({
      where: eq(teamMembershipTable.id, input.membershipId),
    });

    if (!membership) {
      throw new ZSAError("NOT_FOUND", "Membership not found");
    }

    if (membership.teamId !== input.teamId) {
      throw new ZSAError("FORBIDDEN", "Membership does not belong to this team");
    }

    // Cannot remove yourself
    if (membership.userId === user.id) {
      throw new ZSAError("FORBIDDEN", "Cannot remove yourself from the team");
    }

    await db.delete(teamMembershipTable)
      .where(eq(teamMembershipTable.id, input.membershipId));

    return { success: true };
  });

// Update team details
const updateTeamSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  avatarUrl: z.string().max(600).optional(),
});

export const updateTeamAction = createServerAction()
  .input(updateTeamSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Verify user has permission to edit team settings
    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

    const { teamId, ...updateData } = input;

    const [updatedTeam] = await db.update(teamTable)
      .set(updateData)
      .where(eq(teamTable.id, teamId))
      .returning();

    return { team: updatedTeam };
  });

// Change member role
const changeMemberRoleSchema = z.object({
  teamId: z.string(),
  membershipId: z.string(),
  roleId: z.string(),
  isSystemRole: z.boolean(),
});

export const changeMemberRoleAction = createServerAction()
  .input(changeMemberRoleSchema)
  .handler(async ({ input }) => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Verify user has permission to change member roles
    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.CHANGE_MEMBER_ROLES);

    const membership = await db.query.teamMembershipTable.findFirst({
      where: eq(teamMembershipTable.id, input.membershipId),
    });

    if (!membership) {
      throw new ZSAError("NOT_FOUND", "Membership not found");
    }

    if (membership.teamId !== input.teamId) {
      throw new ZSAError("FORBIDDEN", "Membership does not belong to this team");
    }

    // Cannot change your own role
    if (membership.userId === user.id) {
      throw new ZSAError("FORBIDDEN", "Cannot change your own role");
    }

    const [updatedMembership] = await db.update(teamMembershipTable)
      .set({
        roleId: input.roleId,
        isSystemRole: input.isSystemRole ? 1 : 0,
      })
      .where(eq(teamMembershipTable.id, input.membershipId))
      .returning();

    return { membership: updatedMembership };
  });

// Get pending invitations for current user
export const getMyPendingInvitationsAction = createServerAction()
  .handler(async () => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Get all invitations for the user's email that haven't been accepted
    const invitations = await db.query.teamInvitationTable.findMany({
      where: eq(teamInvitationTable.email, user.email),
      with: {
        team: true,
        invitedByUser: true,
      },
    });

    // Filter to only pending (not accepted) and not expired
    const now = new Date();
    const pendingInvitations = invitations.filter(
      (inv) => !inv.acceptedAt && new Date(inv.expiresAt) > now
    );

    return { invitations: pendingInvitations };
  });

// Get all pending invitations from teams where user is owner
export const getMyTeamsPendingInvitationsAction = createServerAction()
  .handler(async () => {
    const { user } = await getSessionFromCookie();
    if (!user) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Get all teams where user is owner
    const memberships = await db.query.teamMembershipTable.findMany({
      where: and(
        eq(teamMembershipTable.userId, user.id),
        eq(teamMembershipTable.isActive, 1)
      ),
      with: {
        team: true,
      },
    });

    const ownerTeamIds = memberships
      .filter((m) => m.roleId === "owner")
      .map((m) => m.teamId);

    if (ownerTeamIds.length === 0) {
      return { invitations: [] };
    }

    // Get all pending invitations for these teams
    const allInvitations = await db.query.teamInvitationTable.findMany({
      with: {
        team: true,
        invitedByUser: true,
      },
    });

    // Filter to only invitations from teams user owns and that are pending
    const now = new Date();
    const pendingInvitations = allInvitations.filter(
      (inv) =>
        ownerTeamIds.includes(inv.teamId) &&
        !inv.acceptedAt &&
        new Date(inv.expiresAt) > now
    );

    return { invitations: pendingInvitations };
  });

// Switch active team
const switchTeamSchema = z.object({
  teamId: z.string(),
});

export const switchTeamAction = createServerAction()
  .input(switchTeamSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();

    // Verify user is a member of the team
    const membership = await db.query.teamMembershipTable.findFirst({
      where: and(
        eq(teamMembershipTable.userId, session.user.id),
        eq(teamMembershipTable.teamId, input.teamId),
        eq(teamMembershipTable.isActive, 1)
      ),
    });

    if (!membership) {
      throw new ZSAError("FORBIDDEN", "You are not a member of this team");
    }

    // Update session with new activeTeamId
    const { updateKVSessionTeam } = await import("@/utils/kv-session");
    const updatedSession = await updateKVSessionTeam(
      session.id,
      session.userId,
      input.teamId
    );

    if (!updatedSession) {
      throw new ZSAError("INTERNAL_SERVER_ERROR", "Failed to update session");
    }

    return { success: true, activeTeamId: input.teamId };
  });

// Create new team
const createTeamSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
});

export const createTeamAction = createServerAction()
  .input(createTeamSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("UNAUTHORIZED", "You must be logged in");

    const db = getDB();
    const { SYSTEM_ROLES_ENUM } = await import("@/db/schema");

    // Check if slug is already taken
    const existingTeam = await db.query.teamTable.findFirst({
      where: eq(teamTable.slug, input.slug),
    });

    if (existingTeam) {
      throw new ZSAError("CONFLICT", "Team slug already exists");
    }

    // Create team
    const [newTeam] = await db.insert(teamTable)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description,
      })
      .returning();

    // Add user as owner
    await db.insert(teamMembershipTable).values({
      teamId: newTeam.id,
      userId: session.user.id,
      roleId: SYSTEM_ROLES_ENUM.OWNER,
      isSystemRole: 1,
      joinedAt: new Date(),
      isActive: 1,
    });

    // Switch to new team
    const { updateKVSessionTeam } = await import("@/utils/kv-session");
    await updateKVSessionTeam(session.id, session.userId, newTeam.id);

    return { team: newTeam };
  });
