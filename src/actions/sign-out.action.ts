"use server";

import {
  deleteSessionTokenCookie,
  getSessionFromCookie,
  invalidateSession
} from "@/utils/auth";
import { withRateLimit } from "@/utils/with-rate-limit";
import ms from "ms";

export const signOutAction = async () => {
  return withRateLimit(
    async () => {
      const session = await getSessionFromCookie()

      if (!session) return;

      await invalidateSession(
        session.id,
        session.userId
      );

      deleteSessionTokenCookie();
    },
    {
      identifier: "sign-out",
      limit: 5,
      windowInSeconds: Math.floor(ms("10 minutes") / 1000),
    }
  );
};

