import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "@/lib/ai/access-control";
import { BlockedAccess } from "../_components/blocked-access";
import { redirect } from "next/navigation";
import { UsageStats } from "./_components/usage-stats";

export const metadata = {
  title: "AI Usage Analytics | List To Ladle",
  description: "View AI assistant usage statistics and costs",
};

export default async function AIUsagePage() {
  // Check auth
  const session = await getSessionFromCookie();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.activeTeamId) {
    return <div>No active team selected</div>;
  }

  // Check AI access
  const accessCheck = await checkAiAccess({
    teamId: session.activeTeamId,
    userId: session.user.id,
  });

  if (!accessCheck.allowed) {
    return <BlockedAccess />;
  }

  return <UsageStats />;
}
