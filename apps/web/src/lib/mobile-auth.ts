import "server-only";

import { getDB } from "@/db";
import { teamMembershipTable, teamTable } from "@/db/schema";
import { getSessionFromCookie } from "@/utils/auth";
import { getMembershipPermissions, getUserTeamMembership } from "@/utils/team-auth";
import { and, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { getTeamEntitlements } from "@/lib/entitlements";

export class MobileAPIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MobileAPIError";
  }
}

export async function requireMobileSession() {
  const session = await getSessionFromCookie();
  if (!session) throw new MobileAPIError(401, "Authentication required");
  if (!session.activeTeamId) throw new MobileAPIError(403, "No active team selected");

  const db = getDB();
  const membership = await getUserTeamMembership(session.user.id, session.activeTeamId);

  if (!membership) throw new MobileAPIError(403, "Active team membership is no longer valid");

  const [activeTeam, memberships, permissions] = await Promise.all([
    db.query.teamTable.findFirst({
      where: eq(teamTable.id, session.activeTeamId),
    }),
    db
      .select({
        id: teamTable.id,
        name: teamTable.name,
        slug: teamTable.slug,
        avatarUrl: teamTable.avatarUrl,
        roleId: teamMembershipTable.roleId,
      })
      .from(teamMembershipTable)
      .innerJoin(teamTable, eq(teamMembershipTable.teamId, teamTable.id))
      .where(
        and(
          eq(teamMembershipTable.userId, session.user.id),
          eq(teamMembershipTable.isActive, 1),
        ),
      ),
    getMembershipPermissions({ membership }),
  ]);
  if (!activeTeam) throw new MobileAPIError(403, "Active team no longer exists");

  return {
    session,
    activeTeam,
    memberships,
    permissions,
    teamId: session.activeTeamId,
    userId: session.user.id,
  };
}

export async function createMobileSessionDTO(
  context: Awaited<ReturnType<typeof requireMobileSession>>,
) {
  const activeMembership = context.memberships.find(
    (membership) => membership.id === context.activeTeam.id,
  );

  const entitlements = await getTeamEntitlements({ teamId: context.activeTeam.id });

  return {
    protocolVersion: 1,
    user: {
      id: context.session.user.id,
      email: context.session.user.email,
      firstName: context.session.user.firstName,
      lastName: context.session.user.lastName,
      avatar: context.session.user.avatar,
    },
    activeTeam: {
      id: context.activeTeam.id,
      name: context.activeTeam.name,
      slug: context.activeTeam.slug,
      avatarUrl: context.activeTeam.avatarUrl,
      roleId: activeMembership?.roleId,
    },
    teams: context.memberships,
    permissions: context.permissions,
    entitlements,
  };
}

export function mobileAPIErrorResponse(error: unknown) {
  if (error instanceof MobileAPIError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json(
      { error: "Invalid request", issues: error.flatten() },
      { status: 400 },
    );
  }

  if (error instanceof Error && error.message.startsWith("Rate limit exceeded")) {
    return Response.json({ error: error.message }, { status: 429 });
  }

  console.error(error);
  return Response.json({ error: "An unexpected error occurred" }, { status: 500 });
}

export function assertMobileMutationOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  const expectedOrigin = new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    throw new MobileAPIError(403, "A same-origin request is required");
  }
}
