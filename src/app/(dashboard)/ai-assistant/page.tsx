import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "@/lib/ai/access-control";
import { BlockedAccess } from "./_components/blocked-access";
import { ChatInterface } from "./_components/chat-interface";
import { redirect } from "next/navigation";

export const metadata = {
  title: "AI Assistant | Food Tracker",
  description: "AI-powered cooking and meal planning assistant",
};

export default async function AIAssistantPage() {
  // Check auth
  const session = await getSessionFromCookie();
  if (!session) {
    redirect("/sign-in");
  }

  if (!session.activeTeamId) {
    return <div>No active team selected</div>;
  }

  // Check AI access
  const accessCheck = await checkAiAccess(session.activeTeamId);

  if (!accessCheck.allowed) {
    return <BlockedAccess />;
  }

  // Render chat interface
  return <ChatInterface settings={accessCheck.settings!} />;
}
