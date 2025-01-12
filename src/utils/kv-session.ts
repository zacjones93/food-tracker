import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type User } from "@/db/schema";

const SESSION_PREFIX = "session:";

export function getSessionKey(userId: string, sessionId: string): string {
  return `${SESSION_PREFIX}${userId}:${sessionId}`;
}

export interface KVSession {
  id: string;
  userId: string;
  expiresAt: number;
  created: number;
}

export interface KVSessionWithUser extends KVSession {
  user: User;
}

export async function getKV() {
  const { env } = await getCloudflareContext();
  return env.NEXT_CACHE_WORKERS_KV;
}

export async function createKVSession(sessionId: string, userId: string, expiresAt: Date): Promise<KVSession> {
  const kv = await getKV();

  const session: KVSession = {
    id: sessionId,
    userId,
    expiresAt: expiresAt.getTime(),
    created: Date.now()
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

  session.expiresAt = expiresAt.getTime();

  const kv = await getKV();
  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(session),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return session;
}

export async function deleteKVSession(sessionId: string, userId: string): Promise<void> {
  const session = await getKVSession(sessionId, userId);
  if (!session) return;

  const kv = await getKV();
  await kv.delete(getSessionKey(userId, sessionId));
}
