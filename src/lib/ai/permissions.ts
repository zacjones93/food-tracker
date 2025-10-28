import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "./access-control";

export async function requireAiAccess() {
  const session = await getSessionFromCookie();

  if (!session) {
    throw new Error("Unauthorized - please sign in");
  }

  if (!session.activeTeamId) {
    throw new Error("No active team selected");
  }

  const accessCheck = await checkAiAccess(session.activeTeamId);

  if (!accessCheck.allowed) {
    throw new Error(accessCheck.reason ?? "AI access denied");
  }

  return {
    session,
    settings: accessCheck.settings!,
  };
}
