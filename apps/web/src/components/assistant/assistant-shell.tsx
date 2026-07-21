"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "@/components/ui/themed-icons";
import { cn } from "@/lib/utils";
import {
  getAssistantContextKey,
  type AssistantSettings,
} from "@/lib/ai/assistant-context";
import { ChatInterface } from "@/app/(dashboard)/ai-assistant/_components/chat-interface";
import { useAssistant } from "./assistant-provider";

interface AssistantShellProps {
  children: React.ReactNode;
  settings: AssistantSettings;
}

export function AssistantShell({ children, settings }: AssistantShellProps) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const {
    attachedContext,
    currentPageContext,
    isOpen,
    attachCurrentPage,
    closeAssistant,
    detachContext,
    openAssistant,
  } = useAssistant();
  const isAssistantRoute = pathname.startsWith("/ai-assistant");
  const hasNewPageContext =
    currentPageContext &&
    getAssistantContextKey(currentPageContext) !==
      getAssistantContextKey(attachedContext);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAssistant();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAssistant, isOpen]);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>

      {!isAssistantRoute && (
        <aside
          aria-label="Ladle assistant"
          aria-hidden={!isOpen}
          inert={!isOpen}
          className={cn(
            "fixed inset-x-2 bottom-2 z-40 flex h-[min(78svh,44rem)] flex-col overflow-hidden rounded-xl border border-cream-300 bg-background shadow-2xl transition-[transform,opacity] duration-300 ease-out md:relative md:inset-auto md:z-auto md:h-auto md:rounded-none md:border-y-0 md:border-r-0 md:shadow-none md:transition-[width,opacity]",
            isOpen
              ? "translate-y-0 opacity-100 md:w-[26rem]"
              : "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0 md:w-0 md:translate-y-0",
          )}
        >
          <div className="flex w-full min-w-0 flex-1 flex-col md:w-[26rem]">
            <div className="flex items-center gap-3 border-b border-cream-300 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-mystic-100 text-mystic-700 dark:bg-mystic-800 dark:text-cream-100">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg leading-tight text-mystic-900 dark:text-cream-100">
                  Ladle
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Your recipes and meal plans, in context
                </p>
              </div>
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeAssistant}
                aria-label="Close Ladle assistant"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-2 border-b border-cream-300 px-4 py-3">
              {attachedContext ? (
                <div className="flex items-center gap-2 rounded-lg bg-cream-200 px-3 py-2 text-sm text-mystic-800 dark:bg-mystic-800 dark:text-cream-100">
                  <span aria-hidden="true">
                    {attachedContext.kind === "week" ? "📅" : "🍽️"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    Using {attachedContext.label}
                  </span>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={detachContext}
                    aria-label={`Stop using ${attachedContext.label} as context`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ask about your recipe collection or meal plans.
                </p>
              )}

              {hasNewPageContext && (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    Now viewing {currentPageContext.label}
                  </span>
                  <button
                    type="button"
                    onClick={attachCurrentPage}
                    className="shrink-0 font-semibold text-mystic-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-cream-200"
                  >
                    Use this page
                  </button>
                </div>
              )}
            </div>

            <ChatInterface
              settings={settings}
              pageContext={attachedContext}
              variant="panel"
            />
          </div>
        </aside>
      )}

      {!isAssistantRoute && !isOpen && (
        <Button
          type="button"
          variant="secondary"
          className="fixed bottom-4 right-4 z-30 gap-2 shadow-md md:hidden"
          onClick={openAssistant}
          aria-label="Ask Ladle about this page"
        >
          <Sparkles className="size-4" />
          Ask Ladle
        </Button>
      )}
    </div>
  );
}

export function AssistantTrigger() {
  const pathname = usePathname();
  const { isOpen, openAssistant } = useAssistant();

  if (pathname.startsWith("/ai-assistant")) return null;

  return (
    <Button
      type="button"
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      onClick={openAssistant}
      aria-expanded={isOpen}
      aria-label="Ask Ladle about this page"
      className="hidden md:inline-flex"
    >
      <Sparkles className="size-4" />
      Ask Ladle
    </Button>
  );
}
