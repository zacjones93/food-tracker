"use client";

import { CalendarDays, Loader2, Utensils, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { AssistantPageContext } from "@/lib/ai/assistant-context";
import {
  getActiveAssistantMention,
  getAssistantContextIdentity,
  insertAssistantMention,
} from "@/lib/ai/assistant-mentions";
import { cn } from "@/lib/utils";

interface AssistantMentionInputProps {
  value: string;
  contexts: AssistantPageContext[];
  onChange: (value: string) => void;
  onContextsChange: (contexts: AssistantPageContext[]) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

const MAX_CONTEXTS = 4;

export function AssistantMentionInput({
  value,
  contexts,
  onChange,
  onContextsChange,
  placeholder,
  disabled = false,
  autoFocus = false,
}: AssistantMentionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(value.length);
  const [items, setItems] = useState<AssistantPageContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);
  const mention = useMemo(
    () => getActiveAssistantMention({ value, cursor }),
    [cursor, value],
  );
  const isAtLimit = contexts.length >= MAX_CONTEXTS;
  const isOpen = Boolean(
    mention && mention.start !== dismissedMentionStart && !disabled,
  );

  useEffect(() => {
    if (!mention || mention.start === dismissedMentionStart || isAtLimit || disabled) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    setItems([]);
    setIsLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/assistant/mentions?q=${encodeURIComponent(mention.query)}`,
          { signal: abortController.signal },
        );
        if (!response.ok) throw new Error("Mention search failed");
        const body = (await response.json()) as { items?: AssistantPageContext[] };
        setItems(body.items ?? []);
        setActiveIndex(0);
      } catch (error) {
        if (!abortController.signal.aborted) setItems([]);
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    }, 140);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [disabled, dismissedMentionStart, isAtLimit, mention]);

  function selectContext(context: AssistantPageContext) {
    if (!mention) return;
    const next = insertAssistantMention({ value, mention, context });
    const identity = getAssistantContextIdentity(context);
    if (!contexts.some((item) => getAssistantContextIdentity(item) === identity)) {
      onContextsChange([...contexts, context]);
    }
    onChange(next.value);
    setCursor(next.cursor);
    setDismissedMentionStart(mention.start);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function updateCursor() {
    setCursor(inputRef.current?.selectionStart ?? value.length);
  }

  return (
    <div className="relative min-w-0 flex-1">
      {contexts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Attached mentions">
          {contexts.map((context) => (
            <span
              key={getAssistantContextIdentity(context)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-cream-300 bg-cream-100 px-2.5 py-1 text-xs font-medium text-mystic-800 dark:border-mystic-700 dark:bg-mystic-900 dark:text-cream-100"
            >
              {context.kind === "week" ? (
                <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Utensils className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{context.label}</span>
              <button
                type="button"
                className="-mr-1 flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-cream-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-mystic-800"
                onClick={() =>
                  onContextsChange(
                    contexts.filter(
                      (item) =>
                        getAssistantContextIdentity(item) !==
                        getAssistantContextIdentity(context),
                    ),
                  )
                }
                aria-label={`Remove ${context.label} from context`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {isOpen && (
        <div
          id="assistant-mention-results"
          role="listbox"
          className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-cream-300 bg-background shadow-xl dark:border-mystic-700"
        >
          <div className="border-b border-cream-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:border-mystic-800">
            Add to Ladle&apos;s context
          </div>
          {isAtLimit ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Remove a context item before adding another.
            </p>
          ) : isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching your kitchen…
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matching recipes or schedules.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1.5">
              {items.map((context, index) => (
                <button
                  id={`assistant-mention-${index}`}
                  key={getAssistantContextIdentity(context)}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectContext(context)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    index === activeIndex
                      ? "bg-cream-200 text-mystic-900 dark:bg-mystic-800 dark:text-cream-100"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-mystic-700 shadow-sm dark:bg-mystic-900 dark:text-cream-200">
                    {context.kind === "week" ? (
                      <CalendarDays className="size-4" />
                    ) : (
                      <Utensils className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {context.label}
                    </span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {context.kind === "week" ? "Schedule" : "Recipe"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => {
          const nextCursor = event.target.selectionStart ?? event.target.value.length;
          const nextMention = getActiveAssistantMention({
            value: event.target.value,
            cursor: nextCursor,
          });
          onChange(event.target.value);
          setCursor(nextCursor);
          setDismissedMentionStart((current) =>
            nextMention?.start === current ? current : null,
          );
        }}
        onClick={updateCursor}
        onKeyUp={updateCursor}
        onKeyDown={(event) => {
          if (!isOpen || items.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % items.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + items.length) % items.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const selected = items[activeIndex];
            if (selected) selectContext(selected);
          } else if (event.key === "Escape") {
            event.preventDefault();
            if (mention) setDismissedMentionStart(mention.start);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "assistant-mention-results" : undefined}
        aria-activedescendant={
          isOpen && items.length > 0 ? `assistant-mention-${activeIndex}` : undefined
        }
      />
    </div>
  );
}
