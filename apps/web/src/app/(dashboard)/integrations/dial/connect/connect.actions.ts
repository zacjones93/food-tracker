"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";

import { approveDialConnectionIntent } from "@/lib/dial-integration";
import { getSessionFromCookie } from "@/utils/auth";

export const approveDialConnectionAction = createServerAction()
  .input(z.object({ intent: z.string().min(32).max(500) }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");

    try {
      const approval = await approveDialConnectionIntent({
        intentToken: input.intent,
        teamId: session.activeTeamId,
        userId: session.user.id,
      });
      return { returnUrl: approval.returnUrl };
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (code === "FORBIDDEN" || code === "TEAM_REQUIRED") {
        throw new ZSAError("FORBIDDEN", "You cannot pair the active Listo team");
      }
      if (code.includes("INTENT")) {
        throw new ZSAError("PRECONDITION_FAILED", "This connection request is invalid, expired, or already used");
      }
      throw new ZSAError("INTERNAL_SERVER_ERROR", "The connection could not be approved");
    }
  });
