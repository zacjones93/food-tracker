import "server-only";

import { getDB } from "@/db";
import {
  aiChatsTable,
  notificationPushDevicesTable,
  teamInvitationTable,
  teamMembershipTable,
  teamSubscriptionsTable,
  teamTable,
  userTable,
} from "@/db/schema";
import { getStripe } from "@/lib/stripe";
import {
  blockUserSessionsForAccountDeletion,
  deleteAllSessionsOfUser,
  unblockUserSessionsForAccountDeletion,
} from "@/utils/kv-session";
import { verifyPassword } from "@/utils/password-hasher";
import { and, eq, inArray, ne, notExists, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { AccountDeletionPreview, AccountDeletionRequest } from "./account-deletion-contract";
import { createAccountDeletionPreview } from "./account-deletion-policy";
import {
  AccountDeletionBlockedError,
  executeAccountDeletionWorkflow,
} from "./account-deletion-workflow";

export { AccountDeletionBlockedError } from "./account-deletion-workflow";

export class AccountDeletionAuthenticationError extends Error {
  constructor() {
    super("The current password is incorrect");
    this.name = "AccountDeletionAuthenticationError";
  }
}

export async function getAccountDeletionPreview({
  userId,
}: {
  userId: string;
}): Promise<AccountDeletionPreview> {
  const db = getDB();
  const userMemberships = await db
    .select({ teamId: teamMembershipTable.teamId })
    .from(teamMembershipTable)
    .where(eq(teamMembershipTable.userId, userId));
  const teamIds = [...new Set(userMemberships.map((membership) => membership.teamId))];

  if (teamIds.length === 0) {
    return createAccountDeletionPreview({ memberships: [], userId });
  }

  const memberships = await db
    .select({
      isActive: teamMembershipTable.isActive,
      roleId: teamMembershipTable.roleId,
      teamId: teamMembershipTable.teamId,
      teamName: teamTable.name,
      userId: teamMembershipTable.userId,
    })
    .from(teamMembershipTable)
    .innerJoin(teamTable, eq(teamMembershipTable.teamId, teamTable.id))
    .where(inArray(teamMembershipTable.teamId, teamIds));

  return createAccountDeletionPreview({ memberships, userId });
}

export async function deleteAccount({
  input,
  userId,
}: {
  input: AccountDeletionRequest;
  userId: string;
}) {
  const db = getDB();
  const user = await db.query.userTable.findFirst({
    columns: { email: true, id: true, passwordHash: true },
    where: eq(userTable.id, userId),
  });
  if (!user) throw new AccountDeletionAuthenticationError();

  let isPasswordValid = false;
  try {
    isPasswordValid = await verifyPassword({
      passwordAttempt: input.password,
      storedHash: user.passwordHash,
    });
  } catch {
    isPasswordValid = false;
  }
  if (!isPasswordValid) throw new AccountDeletionAuthenticationError();

  const preview = await getAccountDeletionPreview({ userId });

  return executeAccountDeletionWorkflow({
    preview,
    steps: {
      blockSessions: () => blockUserSessionsForAccountDeletion(userId),
      cleanUserReferences: async () => {
        await db
          .update(teamMembershipTable)
          .set({ invitedBy: null })
          .where(eq(teamMembershipTable.invitedBy, userId));
        await db
          .update(teamInvitationTable)
          .set({ invitedBy: null })
          .where(eq(teamInvitationTable.invitedBy, userId));
        await db
          .update(teamInvitationTable)
          .set({ acceptedBy: null })
          .where(eq(teamInvitationTable.acceptedBy, userId));
        await db
          .delete(teamInvitationTable)
          .where(sql`lower(${teamInvitationTable.email}) = ${user.email.toLowerCase()}`);
      },
      deletePushDevices: async () => {
        await db
          .delete(notificationPushDevicesTable)
          .where(eq(notificationPushDevicesTable.userId, userId));
      },
      deleteAssistantData: async () => {
        const chats = await db
          .select({ id: aiChatsTable.id, teamId: aiChatsTable.teamId })
          .from(aiChatsTable)
          .where(eq(aiChatsTable.userId, userId));
        if (chats.length === 0) return;

        const { env } = await getCloudflareContext({ async: true });
        for (const chat of chats) {
          const response = await env.ASSISTANT.fetch(
            new Request("https://assistant.internal/v1/chat/delete", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-assistant-user-id": userId,
                "x-assistant-team-id": chat.teamId,
                "x-assistant-chat-id": chat.id,
                "x-assistant-max-output-tokens": "1",
                "x-request-id": `account-deletion:${crypto.randomUUID()}`,
                "x-run-id": `account-deletion:${crypto.randomUUID()}`,
              },
              body: "{}",
            }),
          );
          if (!response.ok) {
            throw new Error("Unable to delete stored assistant response data");
          }
        }
      },
      deleteStripeCustomers: async (teamIds) => {
        if (teamIds.length === 0) return;
        const bindings = await db.query.teamSubscriptionsTable.findMany({
          columns: { stripeCustomerId: true },
          where: inArray(teamSubscriptionsTable.teamId, teamIds),
        });

        for (const binding of bindings) {
          try {
            await getStripe().customers.del(binding.stripeCustomerId);
          } catch (error) {
            if (isMissingStripeResource(error)) continue;
            throw error;
          }
        }
      },
      deleteTeams: async (teamIds) => {
        for (const teamId of teamIds) {
          const otherMembership = db
            .select({ id: teamMembershipTable.id })
            .from(teamMembershipTable)
            .where(
              and(
                eq(teamMembershipTable.teamId, teamId),
                ne(teamMembershipTable.userId, userId),
              ),
            );
          const deletedTeams = await db
            .delete(teamTable)
            .where(and(eq(teamTable.id, teamId), notExists(otherMembership)))
            .returning({ id: teamTable.id });
          if (deletedTeams.length !== 1) {
            throw new AccountDeletionBlockedError(
              await getAccountDeletionPreview({ userId }),
            );
          }
        }
      },
      deleteUser: async () => {
        const deletedUsers = await db
          .delete(userTable)
          .where(eq(userTable.id, userId))
          .returning({ id: userTable.id });
        if (deletedUsers.length !== 1) throw new Error("Account no longer exists");
      },
      deleteUserSessions: () => deleteAllSessionsOfUser(userId),
      unblockSessions: () => unblockUserSessionsForAccountDeletion(userId),
    },
  });
}

function isMissingStripeResource(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "resource_missing"
  );
}
