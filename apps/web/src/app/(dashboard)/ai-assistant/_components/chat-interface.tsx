"use client";

import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Loader2, Send } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useState, useRef, useEffect, useMemo } from "react";
import type { MyUIMessage } from "@/app/api/chat/route";
import { Message } from "./message";
import { Pencil } from "lucide-react";

interface ChatInterfaceProps {
  settings: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
  chatId?: string; // Optional chatId from route params
}

export function ChatInterface({ settings, chatId: propChatId }: ChatInterfaceProps) {
  // This provides a stable chatId for when we're creating a new chat
  const [backupChatId] = useState(() => crypto.randomUUID());
  const [chatIdFromSearchParams, setChatIdInSearchParams] = useQueryState("chatId");
  const [input, setInput] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesStartRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // Use chatId from prop (route param), search params, or backup
  const chatId = propChatId || chatIdFromSearchParams || backupChatId;

  // Load messages with infinite scroll support
  const PAGE_SIZE = 10;
  const {
    data: chatData,
    isLoading: isLoadingMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: async ({ pageParam = 0 }) => {
      // Only load messages if we have a real chatId (not the backup)
      if (chatId === backupChatId) {
        return { messages: [], title: null, hasMore: false };
      }

      const response = await fetch(
        `/api/chat/messages?chatId=${chatId}&limit=${PAGE_SIZE}&offset=${pageParam}`
      );
      const data = await response.json() as {
        messages: MyUIMessage[];
        title: string | null;
        hasMore: boolean
      };

      return {
        messages: data.messages || [],
        title: data.title || null,
        hasMore: data.hasMore || false,
      };
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    initialPageParam: 0,
  });

  // Flatten all messages from all pages
  // Backend returns pages in chronological order (oldest→newest)
  // Page 0 = oldest messages, Page 1 = newer messages, etc.
  const loadedMessages = useMemo(() =>
    chatData?.pages.flatMap((page) => page.messages) || [],
    [chatData?.pages]
  );
  const chatTitle = chatData?.pages[0]?.title;

  const { messages, setMessages, sendMessage, status, error } =
    useChat<MyUIMessage>({
      id: chatId,
      onFinish: () => {
        // After first message, add chatId to search params if not already there
        if (!chatIdFromSearchParams) {
          setChatIdInSearchParams(chatId);
        }
      },
      onError: (error) => {
        console.error("❌ Chat error:", error);
      },
    });

  // Track last loaded count to detect pagination
  const lastLoadedCountRef = useRef(0);
  const isStreamingRef = useRef(false);

  // Track streaming status
  useEffect(() => {
    isStreamingRef.current = status === 'streaming' || status === 'submitted';
  }, [status]);

  // Update messages when loaded messages change (from query or pagination)
  // But don't update while streaming to avoid overwriting new messages
  useEffect(() => {
    if (loadedMessages.length > 0 &&
        loadedMessages.length !== lastLoadedCountRef.current &&
        !isStreamingRef.current) {
      console.log("📥 Updating messages from query:", {
        loaded: loadedMessages.length,
        previous: lastLoadedCountRef.current,
        status
      });
      lastLoadedCountRef.current = loadedMessages.length;
      setMessages(loadedMessages);
    }
  }, [loadedMessages, setMessages, status]);

  // Mutation to update chat title
  const updateTitleMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const response = await fetch(`/api/chat/update-title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, title: newTitle }),
      });
      if (!response.ok) throw new Error("Failed to update title");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate both the chat messages and the sidebar history
      queryClient.invalidateQueries({ queryKey: ["chat-messages", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });
    },
  });

  // Auto-scroll to bottom when messages change or streaming (but not when loading more)
  useEffect(() => {
    if (shouldScrollToBottom && !isFetchingNextPage) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, status, shouldScrollToBottom, isFetchingNextPage]);

  // Detect scroll to top to load more messages
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;

    if (!scrollContainer || messages.length === 0) {
      if (!scrollContainer) console.warn("⚠️ Scroll container not found");
      return;
    }

    console.log("✅ Scroll listener attached. hasNextPage:", hasNextPage, "messages:", messages.length);

    let isLoadingMore = false;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;

      console.log("📜 Scroll:", {
        scrollTop: Math.round(scrollTop),
        hasNextPage,
        isFetchingNextPage,
        isLoadingMore
      });

      // If scrolled near top (within 200px) and have scrollable content, load more messages
      if (scrollTop < 200 &&
          scrollHeight > clientHeight && // Has scrollable content
          hasNextPage &&
          !isFetchingNextPage &&
          !isLoadingMore) {

        isLoadingMore = true;
        console.log("🔄 Triggering load more messages...");
        const previousScrollHeight = scrollContainer.scrollHeight;
        const previousScrollTop = scrollContainer.scrollTop;

        fetchNextPage().then(() => {
          // Maintain scroll position after loading more messages
          setTimeout(() => {
            const newScrollHeight = scrollContainer.scrollHeight;
            const scrollDiff = newScrollHeight - previousScrollHeight;
            scrollContainer.scrollTop = previousScrollTop + scrollDiff;
            console.log("✅ Loaded more messages. Scroll adjusted by", scrollDiff);
            isLoadingMore = false;
          }, 100);
        });
      }

      // Disable auto-scroll if user manually scrolls up
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
      setShouldScrollToBottom(isNearBottom);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      console.log("🧹 Cleaning up scroll listener");
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, messages.length]);

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Handle starting edit mode
  const startEditingTitle = () => {
    setTitleInput(chatTitle || '');
    setIsEditingTitle(true);
  };

  // Handle saving title
  const saveTitle = () => {
    if (titleInput.trim() && titleInput !== chatTitle) {
      updateTitleMutation.mutate(titleInput.trim());
    }
    setIsEditingTitle(false);
  };

  // Handle cancel editing
  const cancelEditTitle = () => {
    setIsEditingTitle(false);
    setTitleInput('');
  };

  const hasMessages = messages.length > 0;
  const displayTitle = chatTitle || "Untitled Chat";

  return (
    <div className="container mx-auto max-w-4xl h-[calc(100vh-4rem)] p-4 flex flex-col gap-4">
      <Card className="flex-shrink-0">
        <CardHeader>
          {hasMessages ? (
            // Show editable title when chat has started
            <div className="flex items-center gap-2">
              {isEditingTitle ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    ref={titleInputRef}
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle();
                      if (e.key === "Escape") cancelEditTitle();
                    }}
                    onBlur={saveTitle}
                    className="text-lg font-semibold"
                    placeholder="Enter chat title..."
                  />
                </div>
              ) : (
                <>
                  <CardTitle
                    className="flex-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
                    onClick={startEditingTitle}
                  >
                    {displayTitle}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={startEditingTitle}
                    className="h-8 w-8"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ) : (
            // Show welcome banner for new chats
            <>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Cooking Assistant
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Ask about recipes, meal planning, or get cooking suggestions
              </p>
            </>
          )}
        </CardHeader>
      </Card>

      <Card className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {/* Loading spinner at top when fetching more messages */}
            {isFetchingNextPage && (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Invisible marker for scroll position tracking */}
            <div ref={messagesStartRef} />

            {/* Initial loading state */}
            {isLoadingMessages && (
              <div className="text-center text-muted-foreground py-12">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading messages...</p>
              </div>
            )}

            {/* Empty state */}
            {!isLoadingMessages && messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start a conversation by asking about recipes or meal planning</p>
              </div>
            )}

            {/* Messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}

                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-muted"
                  }`}
                >
                  <Message message={message} />
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-sm text-destructive">
                Error: {error.message}
              </div>
            )}

            {/* Invisible div for auto-scroll target */}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(
                {
                  text: input,
                },
                {
                  body: {
                    chatId, // Send chatId in request body
                  },
                }
              );
              setInput('');
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about recipes, meal planning, or cooking tips..."
              disabled={status !== 'ready'}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={status !== 'ready'}>
              {status === 'streaming' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Max tokens: {settings.maxTokensPerRequest.toLocaleString()} | Daily
            limit: {settings.maxRequestsPerDay} requests
          </p>
        </div>
      </Card>
    </div>
  );
}
