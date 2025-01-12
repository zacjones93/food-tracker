import { getCloudflareContext } from "@opennextjs/cloudflare";
import { userTable, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDB } from "@/db";
import { headers } from "next/headers";
import { getUserFromDB } from "@/utils/auth";

const SESSION_PREFIX = "session:";

export function getSessionKey(userId: string, sessionId: string): string {
  return `${SESSION_PREFIX}${userId}:${sessionId}`;
}

type KVSessionUser = Exclude<Awaited<ReturnType<typeof getUserFromDB>>, undefined>;

export interface KVSession {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  user: KVSessionUser;
  country?: string;
  city?: string;
  continent?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export async function getKV() {
  const { env } = await getCloudflareContext();
  return env.NEXT_CACHE_WORKERS_KV;
}

export interface CreateKVSessionParams {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  user: KVSessionUser;
}

export async function createKVSession({
  sessionId,
  userId,
  expiresAt,
  user
}: CreateKVSessionParams): Promise<KVSession> {
  const { cf } = await getCloudflareContext();
  const headersList = await headers();
  const kv = await getKV();

  const session: KVSession = {
    id: sessionId,
    userId,
    expiresAt: expiresAt.getTime(),
    createdAt: Date.now(),
    country: cf?.country,
    city: cf?.city,
    continent: cf?.continent,
    ip: headersList.get('cf-connecting-ip') || headersList.get('x-forwarded-for'),
    userAgent: headersList.get('user-agent'),
    user
  };

  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(session),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return session;
}

export async function getKVSession(sessionId: string, userId: string): Promise<KVSession | null> {
  const kv = await getKV();

  const sessionStr = await kv.get(getSessionKey(userId, sessionId));
  if (!sessionStr) return null;

  return JSON.parse(sessionStr) as KVSession;
}

export async function updateKVSession(sessionId: string, userId: string, expiresAt: Date): Promise<KVSession | null> {
  const session = await getKVSession(sessionId, userId);
  if (!session) return null;

  const db = await getDB();
  const updatedUser = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId)
  });

  if (!updatedUser) {
    throw new Error("User not found");
  }

  const updatedSession: KVSession = {
    ...session,
    expiresAt: expiresAt.getTime(),
    user: updatedUser
  };

  const kv = await getKV();
  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(updatedSession),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return updatedSession;
}

export async function deleteKVSession(sessionId: string, userId: string): Promise<void> {
  const session = await getKVSession(sessionId, userId);
  if (!session) return;

  const kv = await getKV();
  await kv.delete(getSessionKey(userId, sessionId));
}
