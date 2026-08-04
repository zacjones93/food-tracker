interface LegacyMobileMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
}

export function mobileMessagesToAgui({
  chatId,
  runId,
  messages,
  pageContext,
  mentionedContexts,
}: {
  chatId: string;
  runId: string;
  messages: LegacyMobileMessage[];
  pageContext?: unknown;
  mentionedContexts?: unknown;
}) {
  return {
    threadId: chatId,
    runId,
    state: {},
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.parts.map((part) => part.text).join(""),
      parts: message.parts.map((part) => ({ type: "text", content: part.text })),
    })),
    tools: [],
    context: [],
    forwardedProps: {
      chatId,
      ...(pageContext === undefined ? {} : { pageContext }),
      ...(mentionedContexts === undefined ? {} : { mentionedContexts }),
    },
  };
}

export function tanstackEventToLegacyDelta(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6);
  if (payload === "[DONE]") return "data: [DONE]\n\n";
  try {
    const event = JSON.parse(payload) as { type?: unknown; delta?: unknown };
    if (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") {
      return `data: ${JSON.stringify({ type: "text-delta", delta: event.delta })}\n\n`;
    }
    if (event.type === "RUN_FINISHED") return "data: [DONE]\n\n";
  } catch {
    return null;
  }
  return null;
}

export function adaptTanstackStreamForMobile(stream: ReadableStream<Uint8Array>): ReadableStream {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const converted = tanstackEventToLegacyDelta(line.trimEnd());
        if (converted) controller.enqueue(encoder.encode(converted));
      }
    },
    flush(controller) {
      const converted = tanstackEventToLegacyDelta(buffer.trimEnd());
      if (converted) controller.enqueue(encoder.encode(converted));
    },
  }));
}
