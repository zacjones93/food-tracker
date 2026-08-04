import { z } from "zod";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";

export const accountDeletionRequestSchema = z.object({
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
  password: z.string().min(8).max(128),
});

export interface AccountDeletionTeamImpact {
  id: string;
  name: string;
}

export interface AccountDeletionPreview {
  canDelete: boolean;
  deletedTeams: AccountDeletionTeamImpact[];
  leftTeams: AccountDeletionTeamImpact[];
  ownershipTransferRequired: AccountDeletionTeamImpact[];
}

export interface AccountDeletionResult {
  deleted: true;
  deletedTeamCount: number;
  leftTeamCount: number;
}

export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;

export function getOwnershipTransferMessage(preview: AccountDeletionPreview): string {
  const teamNames = preview.ownershipTransferRequired.map((team) => team.name).join(", ");
  return `Transfer ownership of ${teamNames} to another active member before deleting your account.`;
}
