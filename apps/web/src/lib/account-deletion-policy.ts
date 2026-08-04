import { SYSTEM_ROLES_ENUM } from "@/db/schema";

import type { AccountDeletionPreview } from "./account-deletion-contract";

export interface AccountDeletionMembership {
  isActive: number;
  roleId: string;
  teamId: string;
  teamName: string;
  userId: string;
}

export function createAccountDeletionPreview({
  memberships,
  userId,
}: {
  memberships: AccountDeletionMembership[];
  userId: string;
}): AccountDeletionPreview {
  const membershipsByTeam = new Map<string, AccountDeletionMembership[]>();

  for (const membership of memberships) {
    const teamMemberships = membershipsByTeam.get(membership.teamId) ?? [];
    teamMemberships.push(membership);
    membershipsByTeam.set(membership.teamId, teamMemberships);
  }

  const deletedTeams: AccountDeletionPreview["deletedTeams"] = [];
  const leftTeams: AccountDeletionPreview["leftTeams"] = [];
  const ownershipTransferRequired: AccountDeletionPreview["ownershipTransferRequired"] = [];

  for (const [teamId, teamMemberships] of membershipsByTeam) {
    const userMembership = teamMemberships.find((membership) => membership.userId === userId);
    if (!userMembership) continue;

    const team = { id: teamId, name: userMembership.teamName };
    const otherMemberships = teamMemberships.filter((membership) => membership.userId !== userId);

    if (otherMemberships.length === 0) {
      deletedTeams.push(team);
      continue;
    }

    const hasAnotherActiveOwner = otherMemberships.some(
      (membership) =>
        membership.isActive === 1 && membership.roleId === SYSTEM_ROLES_ENUM.OWNER,
    );
    if (userMembership.roleId === SYSTEM_ROLES_ENUM.OWNER && !hasAnotherActiveOwner) {
      ownershipTransferRequired.push(team);
      continue;
    }

    leftTeams.push(team);
  }

  const byName = (left: { name: string }, right: { name: string }) =>
    left.name.localeCompare(right.name);
  deletedTeams.sort(byName);
  leftTeams.sort(byName);
  ownershipTransferRequired.sort(byName);

  return {
    canDelete: ownershipTransferRequired.length === 0,
    deletedTeams,
    leftTeams,
    ownershipTransferRequired,
  };
}
