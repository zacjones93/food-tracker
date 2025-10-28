"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type ChatHistoryItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export function NavAiChats() {
  const pathname = usePathname();

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["chat-history"],
    queryFn: async () => {
      console.log("🔍 NavAiChats: Fetching chat history...");
      const response = await fetch("/api/chat/history");
      console.log("📡 NavAiChats: Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ NavAiChats: Failed to load chats:", response.status, errorText);
        throw new Error("Failed to load chats");
      }

      const data = await response.json() as ChatHistoryItem[];
      console.log("✅ NavAiChats: Received chats:", data);
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  if (isLoading) {
    return (
      <div className="px-2 py-1 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading chats...
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="px-2 py-1 text-xs text-muted-foreground">
        No chat history yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {chats.map((chat) => {
        const isActive = pathname === `/ai-assistant/chat/${chat.id}`;
        return (
          <Link
            key={chat.id}
            href={`/ai-assistant/chat/${chat.id}`}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
              isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1">{chat.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
