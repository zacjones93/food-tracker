"use client";

import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Pencil, RefreshCw, Send, Square, User } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPublicAssistantError } from "@/lib/assistant/errors";
import type { AssistantMessage } from "@/lib/assistant/types";

import { Message } from "./message";

interface ChatInterfaceProps {
  settings: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
  chatId?: string;
}

const PAGE_SIZE = 10;

export function ChatInterface({ settings, chatId: propChatId }: ChatInterfaceProps) {
  const [newChatId] = useState(() => crypto.randomUUID());
  const [queryChatId, setQueryChatId] = useQueryState("chatId");
  const chatId = propChatId || queryChatId || newChatId;
  const [input, setInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const connection = useMemo(() => fetchServerSentEvents("/api/assistant"), []);

  const chatQuery = useInfiniteQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: async ({ pageParam = 0 }) => {
      if (chatId === newChatId) return { messages: [], title: null, hasMore: false };
      const response = await fetch(
        `/api/chat/messages?chatId=${encodeURIComponent(chatId)}&limit=${PAGE_SIZE}&offset=${pageParam}`,
      );
      if (!response.ok) throw new Error("Unable to load chat history");
      return await response.json() as {
        messages: AssistantMessage[];
        title: string | null;
        hasMore: boolean;
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.hasMore
      ? pages.length * PAGE_SIZE
      : undefined,
  });
  const loadedMessages = useMemo(
    () => chatQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [chatQuery.data?.pages],
  );
  const chatTitle = chatQuery.data?.pages[0]?.title;

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    isLoading,
    error,
    stop,
    reload,
    addToolApprovalResponse,
  } = useChat({
    id: chatId,
    threadId: chatId,
    forwardedProps: { chatId },
    connection,
    onFinish: () => {
      if (!queryChatId && !propChatId) void setQueryChatId(chatId);
      void queryClient.invalidateQueries({ queryKey: ["chat-history"] });
    },
  });

  useEffect(() => {
    if (!isLoading && loadedMessages.length > 0) setMessages(loadedMessages);
  }, [isLoading, loadedMessages, setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const updateTitle = useMutation({
    mutationFn: async (title: string) => {
      const response = await fetch("/api/chat/update-title", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, title }),
      });
      if (!response.ok) throw new Error("Unable to update chat title");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat-messages", chatId] }),
        queryClient.invalidateQueries({ queryKey: ["chat-history"] }),
      ]);
    },
  });

  function saveTitle(): void {
    const title = titleInput.trim();
    if (title && title !== chatTitle) updateTitle.mutate(title);
    setIsEditingTitle(false);
  }

  async function submitMessage(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const content = input.trim();
    if (!content || isLoading) return;
    setInput("");
    await sendMessage(content);
  }

  return (
    <div className="container mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col gap-4 p-4">
      <Card className="shrink-0">
        <CardHeader>
          {messages.length > 0 ? (
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <Input
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveTitle();
                    if (event.key === "Escape") setIsEditingTitle(false);
                  }}
                  autoFocus
                />
              ) : (
                <>
                  <CardTitle className="flex-1">{chatTitle || "Untitled Chat"}</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit chat title"
                    onClick={() => {
                      setTitleInput(chatTitle || "");
                      setIsEditingTitle(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" /> AI Cooking Assistant
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ask about your recipes and meal-plan weeks. Retrieval is read-only.
              </p>
            </>
          )}
        </CardHeader>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {chatQuery.hasNextPage && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={chatQuery.isFetchingNextPage}
                  onClick={() => void chatQuery.fetchNextPage()}
                >
                  {chatQuery.isFetchingNextPage ? "Loading…" : "Load older messages"}
                </Button>
              </div>
            )}
            {chatQuery.isLoading && <Loader2 className="mx-auto h-8 w-8 animate-spin" />}
            {!chatQuery.isLoading && messages.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <Bot className="mx-auto mb-4 h-12 w-12 opacity-50" />
                Start by asking about a recipe or a week in your plan.
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                  message.role === "user" ? "bg-blue-600 text-white" : "bg-muted"
                }`}>
                  <Message
                    message={message}
                    onApproval={(id, approved) => void addToolApprovalResponse({ id, approved })}
                  />
                </div>
                {message.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {error && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                <span>{getPublicAssistantError()}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form onSubmit={(event) => void submitMessage(event)} className="flex gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about recipes or meal planning…"
              disabled={isLoading}
              autoFocus
            />
            {isLoading ? (
              <Button type="button" variant="outline" onClick={stop} aria-label="Stop response">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Max tokens: {settings.maxTokensPerRequest.toLocaleString()} · Daily limit: {settings.maxRequestsPerDay}
          </p>
        </div>
      </Card>
    </div>
  );
}
