"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { teamInvitationTable, teamMembershipTable, TEAM_PERMISSIONS } from "@/db/schema";
import { getSessionFromCookie } from "@/utils/auth";
import { requirePermission } from "@/utils/team-auth";
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

const declineInviteSchema = z.object({
  inviteId: z.string(),
});

const acceptInviteByIdSchema = z.object({
  inviteId: z.string(),
});

export const createTeamInviteAction = createServerAction()
  .input(createInviteSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    const { user } = session;

    await requirePermission(user.id, input.teamId, TEAM_PERMISSIONS.INVITE_MEMBERS);

    const db = getDB();

    // Check for existing active invitation
    const existingInvite = await db.query.teamInvitationTable.findFirst({
      where: and(
        eq(teamInvitationTable.teamId, input.teamId),
        eq(teamInvitationTable.email, input.email),
        // Note: acceptedAt = null check needs to be handled differently in SQLite
      ),
    });

    if (existingInvite && !existingInvite.acceptedAt && new Date(existingInvite.expiresAt) > new Date()) {
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

    // Invitation will appear on the invited user's Teams page
    return { invite };
  });

export const acceptTeamInviteAction = createServerAction()
  .input(acceptInviteSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    const { user } = session;

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
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    const { user } = session;

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

export const declineTeamInviteAction = createServerAction()
  .input(declineInviteSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    const { user } = session;

    const db = getDB();

    const invite = await db.query.teamInvitationTable.findFirst({
      where: eq(teamInvitationTable.id, input.inviteId),
    });

    if (!invite) throw new ZSAError("NOT_FOUND", "Invitation not found");

    // Verify the invitation is for this user
    if (invite.email !== user.email) {
      throw new ZSAError("FORBIDDEN", "This invitation is not for you");
    }

    // Delete the invitation
    await db.delete(teamInvitationTable)
      .where(eq(teamInvitationTable.id, input.inviteId));

    return { success: true };
  });

export const acceptTeamInviteByIdAction = createServerAction()
  .input(acceptInviteByIdSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    const { user } = session;

    const db = getDB();

    const invite = await db.query.teamInvitationTable.findFirst({
      where: eq(teamInvitationTable.id, input.inviteId),
    });

    if (!invite) throw new ZSAError("NOT_FOUND", "Invitation not found");
    if (invite.acceptedAt) throw new ZSAError("CONFLICT", "Invitation already accepted");
    if (new Date(invite.expiresAt) < new Date()) {
      throw new ZSAError("FORBIDDEN", "Invitation expired");
    }
    if (invite.email !== user.email) {
      throw new ZSAError("FORBIDDEN", "This invitation is not for you");
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
