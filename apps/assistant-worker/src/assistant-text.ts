import type { ChatMiddleware, StreamChunk } from "@tanstack/ai";
import { EventType } from "@tanstack/ai/client";

import sanitizerModule from "../../web/src/lib/assistant/sanitize-assistant-text";
import { getWorkerAssistantErrorMessage } from "./errors";

const FALLBACK_MESSAGE = getWorkerAssistantErrorMessage("EMPTY_RESPONSE");

const { sanitizeAssistantText } = sanitizerModule;

export { sanitizeAssistantText };

function textContentChunk({
  messageId,
  content,
}: {
  messageId: string;
  content: string;
}): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta: content,
    content,
    timestamp: Date.now(),
  };
}

export function createAssistantTextGuardMiddleware(): ChatMiddleware {
  let bufferedText = "";
  let activeMessageId = "";
  let hasVisibleText = false;
  let hasRedactedText = false;

  function resetMessage(messageId = ""): void {
    bufferedText = "";
    activeMessageId = messageId;
  }

  function flushMessage(): StreamChunk | null {
    if (!activeMessageId || !bufferedText) {
      resetMessage();
      return null;
    }
    const safeText = sanitizeAssistantText(bufferedText);
    if (safeText !== bufferedText.trim()) hasRedactedText = true;
    const messageId = activeMessageId;
    resetMessage();
    if (!safeText) return null;
    hasVisibleText = true;
    return textContentChunk({ messageId, content: safeText });
  }

  return {
    name: "assistant-text-guard",
    onStart() {
      resetMessage();
      hasVisibleText = false;
      hasRedactedText = false;
    },
    onChunk(_context, chunk) {
      if (chunk.type === EventType.TEXT_MESSAGE_START) {
        const safeChunk = flushMessage();
        resetMessage(chunk.messageId);
        return safeChunk ? [safeChunk, chunk] : chunk;
      }
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
        activeMessageId = chunk.messageId;
        bufferedText = typeof chunk.content === "string"
          ? chunk.content
          : bufferedText + chunk.delta;
        return null;
      }
      if (chunk.type === EventType.TEXT_MESSAGE_END) {
        const safeChunk = flushMessage();
        return safeChunk ? [safeChunk, chunk] : chunk;
      }
      if (chunk.type === EventType.RUN_FINISHED) {
        const safeChunk = flushMessage();
        if (safeChunk) return [safeChunk, chunk];
        if (!hasRedactedText || hasVisibleText) return chunk;
        const messageId = `assistant-redacted-${crypto.randomUUID()}`;
        return [
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            role: "assistant",
            timestamp: Date.now(),
          },
          textContentChunk({ messageId, content: FALLBACK_MESSAGE }),
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId,
            timestamp: Date.now(),
          },
          chunk,
        ];
      }
      return chunk;
    },
  };
}
