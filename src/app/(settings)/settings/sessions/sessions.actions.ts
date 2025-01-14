"use server";

import { createServerAction, ZSAError } from "zsa";
import { getSessionFromCookie } from "@/utils/auth";
import { getAllSessionIdsOfUser, getKVSession, deleteKVSession, type KVSession } from "@/utils/kv-session";
import { z } from "zod";

interface SessionWithMeta extends KVSession {
  isCurrentSession: boolean;
  expiration?: Date;
  createdAt: number;
}

function isValidSession(session: unknown): session is SessionWithMeta {
  if (!session || typeof session !== 'object') return false;
  const sessionObj = session as Record<string, unknown>;
  return 'createdAt' in sessionObj && typeof sessionObj.createdAt === 'number';
}

export const getSessionsAction = createServerAction()
  .input(z.void())
  .handler(async () => {
    const session = await getSessionFromCookie();

    if (!session) {
      throw new ZSAError(
        "NOT_AUTHORIZED",
        "Not authenticated"
      );
    }

    const sessionIds = await getAllSessionIdsOfUser(session.user.id);
    const sessions = await Promise.all(
      sessionIds.map(async ({ key, absoluteExpiration }) => {
        const sessionId = key.split(":")[2]; // Format is "session:userId:sessionId"
        const sessionData = await getKVSession(sessionId, session.user.id);
        if (!sessionData) return null;
        return {
          ...sessionData,
          isCurrentSession: sessionId === session.id,
          expiration: absoluteExpiration,
          createdAt: sessionData.createdAt ?? 0,
        } as SessionWithMeta;
      })
    );

    // Filter out any null sessions and sort by creation date
    return sessions
      .filter(isValidSession)
      .sort((a, b) => b.createdAt - a.createdAt);
  });

export const deleteSessionAction = createServerAction()
  .input(z.object({
    sessionId: z.string(),
  }))
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();

    if (!session) {
      throw new ZSAError(
        "NOT_AUTHORIZED",
        "Not authenticated"
      );
    }

    await deleteKVSession(input.sessionId, session.user.id);

    return { success: true };
  });
