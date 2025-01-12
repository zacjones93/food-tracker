import "server-only";

import { type User, userTable } from "@/db/schema";
import { init } from "@paralleldrive/cuid2";
import { encodeHexLowerCase } from "@oslojs/encoding"
import { sha256 } from "@oslojs/crypto/sha2"
import ms from "ms"
import { getDB } from "@/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import isProd from "@/utils/isProd";
import {
  createKVSession,
  deleteKVSession,
  getKV,
  getSessionKey,
  updateKVSession,
  type KVSession
} from "./kv-session";
import { cache } from "react"

const getSessionLength = () => {
  return ms("30d");
}

const SESSION_COOKIE_NAME = "session";

const createId = init({
  length: 48,
});

export function generateSessionToken(): string {
  return createId();
}

export type SessionValidationResult =
  | User & { session: KVSession }
  | null;

function encodeSessionCookie(userId: string, token: string): string {
  return `${userId}:${token}`;
}

function decodeSessionCookie(cookie: string): { userId: string; token: string } | null {
  const parts = cookie.split(':');
  if (parts.length !== 2) return null;
  return { userId: parts[0], token: parts[1] };
}

// Based on https://lucia-auth.com/sessions/overview
export async function createSession(token: string, userId: string): Promise<KVSession> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const expiresAt = new Date(Date.now() + getSessionLength());

  return createKVSession(sessionId, userId, expiresAt);
}

export async function validateSessionToken(token: string, userId: string): Promise<SessionValidationResult | null> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const kv = await getKV();

  const sessionStr = await kv.get(getSessionKey(userId, sessionId));
  if (!sessionStr) return null;

  const session = JSON.parse(sessionStr) as KVSession;

  // If the session has expired, delete it and return null
  if (Date.now() >= session.expiresAt) {
    await deleteKVSession(sessionId, userId);
    return null;
  }

  const db = await getDB();
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
  });

  if (!user) {
    await deleteKVSession(sessionId, userId);
    return null;
  }

  // TODO: Error: Cookies can only be modified in a Server Action or Route Handler.
  // if (Date.now() >= session.expiresAt - (getSessionLength() / 2)) {
  //   const newExpiresAt = new Date(Date.now() + getSessionLength());
  //   const updatedSession = await updateKVSession(sessionId, userId, newExpiresAt);

  //   if (!updatedSession) return null;

  //   // Update the session in the cookie
  //   await setSessionTokenCookie({
  //     token,
  //     userId,
  //     expiresAt: newExpiresAt
  //   });

  //   return {
  //     ...user,
  //     session: updatedSession,
  //   };
  // }

  return {
    ...user,
    session,
  };
}

export async function invalidateSession(sessionId: string, userId: string): Promise<void> {
  await deleteKVSession(sessionId, userId);
}

export interface SetSessionTokenCookieParams {
  token: string;
  userId: string;
  expiresAt: Date;
}

export async function setSessionTokenCookie({ token, userId, expiresAt }: SetSessionTokenCookieParams): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie(userId, token), {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    expires: expiresAt,
    path: "/",
  });
}

export async function deleteSessionTokenCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export const getSessionFromCookie = cache(async (): Promise<SessionValidationResult | null> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  const decoded = decodeSessionCookie(sessionCookie);

  if (!decoded || !decoded.token || !decoded.userId) {
    return null;
  }

  return validateSessionToken(decoded.token, decoded.userId);
})
