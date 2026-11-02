import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDB } from "@/db";
import { teamTable } from "@/db/schema";
import { getUserTeamMembership } from "@/utils/team-auth";
import { getTeamEntitlements } from "@/lib/entitlements";

const getTeamWithSettings = cache(async function getTeamWithSettings(teamId: string) {
  return getDB().query.teamTable.findFirst({
    where: eq(teamTable.id, teamId),
    with: { settings: true },
  });
});

// Returns facts; callers retain their existing denial ordering and error contracts.
export async function resolveTeamAccess({ userId, teamId }: { userId: string; teamId: string }) {
  const [teamData, membership, entitlements] = await Promise.all([
    getTeamWithSettings(teamId),
    getUserTeamMembership(userId, teamId),
    getTeamEntitlements({ teamId }),
  ]);
  return { teamData, membership, entitlements };
}
