import type { AccountDeletionPreview, AccountDeletionResult } from "./account-deletion-contract";

export class AccountDeletionBlockedError extends Error {
  constructor(public readonly preview: AccountDeletionPreview) {
    super("Transfer ownership of shared teams before deleting this account");
    this.name = "AccountDeletionBlockedError";
  }
}

export interface AccountDeletionWorkflowSteps {
  blockSessions: () => Promise<void>;
  cleanUserReferences: () => Promise<void>;
  deleteAssistantData: () => Promise<void>;
  deletePushDevices: () => Promise<void>;
  deleteStripeCustomers: (teamIds: string[]) => Promise<void>;
  deleteTeams: (teamIds: string[]) => Promise<void>;
  deleteUser: () => Promise<void>;
  deleteUserSessions: () => Promise<void>;
  unblockSessions: () => Promise<void>;
}

export async function executeAccountDeletionWorkflow({
  preview,
  steps,
}: {
  preview: AccountDeletionPreview;
  steps: AccountDeletionWorkflowSteps;
}): Promise<AccountDeletionResult> {
  if (!preview.canDelete) throw new AccountDeletionBlockedError(preview);

  let userDeleted = false;
  try {
    await steps.blockSessions();
    await steps.deletePushDevices();
    await steps.deleteAssistantData();
    await steps.deleteStripeCustomers(preview.deletedTeams.map((team) => team.id));
    await steps.cleanUserReferences();
    await steps.deleteTeams(preview.deletedTeams.map((team) => team.id));
    await steps.deleteUser();
    userDeleted = true;
    try {
      await steps.deleteUserSessions();
    } catch (error) {
      console.error("Failed to remove revoked sessions after account deletion", error);
    }
  } catch (error) {
    if (!userDeleted) {
      try {
        await steps.unblockSessions();
      } catch (unblockError) {
        console.error("Failed to restore sessions after account deletion failed", unblockError);
      }
    }
    throw error;
  }

  return {
    deleted: true,
    deletedTeamCount: preview.deletedTeams.length,
    leftTeamCount: preview.leftTeams.length,
  };
}
