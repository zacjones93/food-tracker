"use client";

import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Loader2, Send } from "lucide-react";
import { useState } from "react";

interface ChatInterfaceProps {
  settings: {
    monthlyBudgetUsd: number;
    maxTokensPerRequest: number;
    maxRequestsPerDay: number;
  };
}

export function ChatInterface({ settings }: ChatInterfaceProps) {
  const [conversationId] = useState(() => `conv_${Date.now()}`);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
      headers: {
        "x-conversation-id": conversationId,
      },
      onError: (error) => {
        console.error("Chat error:", error);
      },
    });

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Cooking Assistant
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ask about recipes, meal planning, or get cooking suggestions
          </p>
        </CardHeader>
      </Card>

      <Card className="h-[600px] flex flex-col">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Start a conversation by asking about recipes or meal planning</p>
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
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}

                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {/* Display tool calls */}
                  {message.toolInvocations && message.toolInvocations.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.toolInvocations.map((tool, idx) => (
                        <div
                          key={idx}
                          className="text-xs bg-background/50 rounded p-2 border"
                        >
                          <div className="font-mono font-medium">
                            🔧 {tool.toolName}
                          </div>
                          {tool.state === "result" && (
                            <pre className="mt-1 overflow-auto text-xs">
                              {JSON.stringify(tool.result, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
                </div>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-sm text-destructive">
                Error: {error.message}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about recipes, meal planning, or cooking tips..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
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
