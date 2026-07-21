export const DEFAULT_TEAM_SETTINGS = {
  aiEnabled: false,
} as const;

export interface AiTeamPolicySettings {
  aiEnabled: boolean;
  aiMonthlyBudgetUsd: string | null;
  aiMaxTokensPerRequest: number | null;
  aiMaxRequestsPerDay: number | null;
}

export function evaluateAiTeamPolicy({
  hasActiveMembership,
  settings,
}: {
  hasActiveMembership: boolean;
  settings: AiTeamPolicySettings | null;
}): { allowed: boolean; reason?: string } {
  if (!hasActiveMembership) {
    return { allowed: false, reason: "You are not an active member of this team." };
  }
  if (!settings) {
    return { allowed: false, reason: "AI policy has not been configured for this team." };
  }
  if (!settings.aiEnabled) {
    return { allowed: false, reason: "AI features are disabled for this team." };
  }
  return { allowed: true };
}
