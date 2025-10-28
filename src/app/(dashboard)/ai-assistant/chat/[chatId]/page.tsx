import "server-only";
import { getSessionFromCookie } from "@/utils/auth";
import { checkAiAccess } from "@/lib/ai/access-control";
import { BlockedAccess } from "../../_components/blocked-access";
import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatInterface } from "../../_components/chat-interface";
import { db } from "@/db";
import { aiChatsTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const metadata = {
  title: "AI Chat | Food Tracker",
  description: "AI-powered cooking and meal planning assistant",
};

type Props = {
  params: Promise<{
    chatId: string;
  }>;
};

export default async function AIChatPage({ params }: Props) {
  const myParams = await params;
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

  if(!db) {
    return <div>Database not found</div>;
  }

  // Verify chat exists and belongs to team
  const chat = await db.query.aiChatsTable.findFirst({
    where: and(
      eq(aiChatsTable.id, myParams.chatId),
      eq(aiChatsTable.teamId, session.activeTeamId)
    ),
  });

  if (!chat) {
    notFound();
  }

  // Render chat interface with existing chat ID
  return (
    <Suspense fallback={<ChatLoadingFallback />}>
      <ChatInterface settings={accessCheck.settings!} chatId={myParams.chatId} />
    </Suspense>
  );
}

function ChatLoadingFallback() {
  return (
    <div className="container mx-auto max-w-4xl p-4">
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    </div>
  );
}
