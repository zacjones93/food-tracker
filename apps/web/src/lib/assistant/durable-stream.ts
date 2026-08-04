import type { StreamChunk } from "@tanstack/ai/client";

interface DurableSubscriptionOptions {
  chatId: string;
  getKnownRunIds: () => string[];
  signal?: AbortSignal;
  retryDelayMs?: number;
  fetcher?: typeof fetch;
}

async function* responseEvents({
  response,
  signal,
}: {
  response: Response;
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk> {
  if (!response.ok || !response.body) {
    throw new Error(`Assistant stream failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (!normalized.startsWith("data:")) continue;
        const data = normalized.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        yield JSON.parse(data) as StreamChunk;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* durableSubscriptionEvents({
  chatId,
  getKnownRunIds,
  signal,
  retryDelayMs = 250,
  fetcher = fetch,
}: DurableSubscriptionOptions): AsyncGenerator<StreamChunk> {
  while (!signal?.aborted) {
    const response = await fetcher("/api/assistant/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatId, knownRunIds: getKnownRunIds() }),
      ...(signal ? { signal } : {}),
    });
    if (response.status === 204) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }
    yield* responseEvents({ response, signal });
    if (!signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
