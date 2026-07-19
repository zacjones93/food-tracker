export interface TeamMembershipSelection {
  teamId: string;
}

interface SelectActiveTeamIdInput {
  defaultTeamId?: string | null;
  memberships: TeamMembershipSelection[];
}

export function selectActiveTeamId({
  defaultTeamId,
  memberships,
}: SelectActiveTeamIdInput) {
  if (defaultTeamId && memberships.some(({ teamId }) => teamId === defaultTeamId)) {
    return defaultTeamId;
  }

  return memberships[0]?.teamId;
}
