"use client";

import { useChat } from "@tanstack/ai-react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bot,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Square,
  User,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAssistantContextSuggestions,
  type AssistantPageContext,
  type AssistantSettings,
} from "@/lib/ai/assistant-context";
import { getPublicAssistantError } from "@/lib/assistant/errors";
import { createDurableAssistantConnection } from "@/lib/assistant/durable-connection";
import {
  getPendingAssistantToolApprovalIds,
  resolveAssistantToolApproval,
} from "@/lib/assistant/tool-approval";
import type { AssistantMessage } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";

import { Message } from "./message";
import { AssistantMentionInput } from "./assistant-mention-input";

interface ChatInterfaceProps {
  settings: AssistantSettings;
  chatId?: string;
  pageContext?: AssistantPageContext | null;
  variant?: "page" | "panel";
}

const PAGE_SIZE = 10;

export function ChatInterface({
  settings,
  chatId: propChatId,
  pageContext = null,
  variant = "page",
}: ChatInterfaceProps) {
  const isPanel = variant === "panel";
  const [newChatId] = useState(() => crypto.randomUUID());
  const [queryChatId, setQueryChatId] = useQueryState("chatId");
  const chatId = propChatId || (!isPanel ? queryChatId : null) || newChatId;
  const [input, setInput] = useState("");
  const [mentionedContexts, setMentionedContexts] = useState<
    AssistantPageContext[]
  >([]);
  const [titleInput, setTitleInput] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knownRunIdsRef = useRef<string[]>([]);
  const queryClient = useQueryClient();

  const chatQuery = useInfiniteQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: async ({ pageParam = 0 }) => {
      if (chatId === newChatId) {
        return { messages: [], title: null, hasMore: false };
      }
      const response = await fetch(
        `/api/chat/messages?chatId=${encodeURIComponent(chatId)}&limit=${PAGE_SIZE}&offset=${pageParam}`,
      );
      if (!response.ok) throw new Error("Unable to load chat history");
      return (await response.json()) as {
        messages: AssistantMessage[];
        title: string | null;
        hasMore: boolean;
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * PAGE_SIZE : undefined,
  });
  const loadedMessages = useMemo(
    () => chatQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [chatQuery.data?.pages],
  );
  knownRunIdsRef.current = loadedMessages
    .map((message) => message.id.endsWith("-assistant")
      ? message.id.slice(0, -"-assistant".length)
      : null)
    .filter((runId): runId is string => Boolean(runId));
  const durableTransport = useMemo(
    () => createDurableAssistantConnection({
      chatId,
      getKnownRunIds: () => knownRunIdsRef.current,
    }),
    [chatId],
  );
  const chatTitle = chatQuery.data?.pages[0]?.title;

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    isLoading,
    sessionGenerating,
    error,
    stop,
    reload,
    interrupts,
  } = useChat({
    threadId: chatId,
    forwardedProps: { chatId, pageContext, mentionedContexts },
    connection: durableTransport.connection,
    live: !chatQuery.isLoading && chatId !== newChatId,
    onFinish: () => {
      if (!isPanel && !queryChatId && !propChatId) {
        void setQueryChatId(chatId);
      }
      void queryClient.invalidateQueries({ queryKey: ["chat-history"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-messages", chatId] });
    },
  });
  const pendingApprovalIds = useMemo(
    () => getPendingAssistantToolApprovalIds({ interrupts }),
    [interrupts],
  );

  const isAssistantBusy = isLoading || sessionGenerating;

  useEffect(() => {
    if (!isAssistantBusy && loadedMessages.length > 0) setMessages(loadedMessages);
  }, [isAssistantBusy, loadedMessages, setMessages]);

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
        queryClient.invalidateQueries({
          queryKey: ["chat-messages", chatId],
        }),
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
    if (!content || isAssistantBusy) return;
    setInput("");
    if (!isPanel && !queryChatId && !propChatId) {
      await setQueryChatId(chatId);
    }
    await sendMessage(content);
    setMentionedContexts([]);
  }

  const suggestions = getAssistantContextSuggestions(pageContext);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        isPanel
          ? "w-full gap-0"
          : "container mx-auto h-[calc(100vh-4rem)] max-w-4xl gap-4 p-4",
      )}
    >
      {!isPanel && (
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
                      if (event.key === "Escape") {
                        setIsEditingTitle(false);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <>
                    <CardTitle className="flex-1">
                      {chatTitle || "Untitled Chat"}
                    </CardTitle>
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
                  Ask about your recipes and meal-plan weeks.
                </p>
              </>
            )}
          </CardHeader>
        </Card>
      )}

      <Card
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          isPanel && "rounded-none border-0 bg-transparent shadow-none",
        )}
      >
        <ScrollArea className={cn("flex-1", isPanel ? "px-4 py-3" : "p-4")}>
          <div className="space-y-4">
            {chatQuery.hasNextPage && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={chatQuery.isFetchingNextPage}
                  onClick={() => void chatQuery.fetchNextPage()}
                >
                  {chatQuery.isFetchingNextPage
                    ? "Loading…"
                    : "Load older messages"}
                </Button>
              </div>
            )}
            {chatQuery.isLoading && (
              <Loader2 className="mx-auto h-8 w-8 animate-spin" />
            )}
            {!chatQuery.isLoading && messages.length === 0 && (
              <div
                className={cn(
                  "text-muted-foreground",
                  isPanel ? "py-5" : "py-12 text-center",
                )}
              >
                {!isPanel && (
                  <Bot className="mx-auto mb-4 h-12 w-12 opacity-50" />
                )}
                <p className={cn("text-sm", isPanel && "mb-3 text-foreground")}>
                  {pageContext
                    ? `What would you like to do with ${pageContext.label}?`
                    : "Start by asking about a recipe or a week in your plan."}
                </p>
                {isPanel && (
                  <div className="flex flex-col gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setInput(suggestion)}
                        className="min-h-11 rounded-lg border border-cream-300 bg-cream-100 px-3 py-2 text-left text-sm text-mystic-800 transition-colors hover:bg-cream-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-mystic-700 dark:bg-mystic-900 dark:text-cream-100 dark:hover:bg-mystic-800"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-lg px-4 py-2",
                    isPanel ? "max-w-[90%]" : "max-w-[85%]",
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-muted",
                  )}
                >
                  <Message
                    message={message}
                    pendingApprovalIds={pendingApprovalIds}
                    onApproval={({ approvalId, approved }) => {
                      const interrupt = interrupts.find(
                        (item) => item.id === approvalId,
                      );
                      if (!interrupt || interrupt.kind === "unbound") return;
                      resolveAssistantToolApproval({ interrupt, approved });
                    }}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void reload()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form
            onSubmit={(event) => void submitMessage(event)}
            className="flex items-end gap-2"
          >
            <AssistantMentionInput
              value={input}
              contexts={mentionedContexts}
              onChange={setInput}
              onContextsChange={setMentionedContexts}
              placeholder={
                pageContext
                  ? `Ask about ${pageContext.label}…`
                  : "Ask anything, or type @ to add context…"
              }
              disabled={isAssistantBusy}
              autoFocus={!isPanel}
            />
            {isAssistantBusy ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  stop();
                  void durableTransport.cancelActiveRun();
                }}
                aria-label="Stop response"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
          {!isPanel && (
            <p className="mt-2 text-xs text-muted-foreground">
              Max tokens: {settings.maxTokensPerRequest.toLocaleString()} ·
              Daily limit: {settings.maxRequestsPerDay}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
