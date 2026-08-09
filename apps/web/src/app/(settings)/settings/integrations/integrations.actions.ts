"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { TEAM_PERMISSIONS } from "@/db/schema";
import { disconnectDialAccount, disconnectDialTeam } from "@/lib/dial-integration";
import { getSessionFromCookie } from "@/utils/auth";
import { hasPermission } from "@/utils/team-auth";

export const disconnectDialAction = createServerAction()
  .input(z.object({ layer: z.enum(["account", "team"]) }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");

    if (input.layer === "account") {
      await disconnectDialAccount(session.user.id);
    } else {
      if (!session.activeTeamId) throw new ZSAError("FORBIDDEN", "No active team selected");
      const canManage = await hasPermission(
        session.user.id,
        session.activeTeamId,
        TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS,
      );
      if (!canManage) throw new ZSAError("FORBIDDEN", "You cannot manage this team's integration");
      await disconnectDialTeam(session.activeTeamId);
    }

    revalidatePath("/settings/integrations");
    return { success: true };
  });
