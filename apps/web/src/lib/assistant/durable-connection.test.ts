import assert from "node:assert/strict";
import test from "node:test";

import { durableSubscriptionEvents } from "./durable-stream";

test("retries a new chat subscription until its durable stream exists", async () => {
  const abortController = new AbortController();
  const events: string[] = [];
  let requestCount = 0;

  const fetcher = (async () => {
    requestCount += 1;
    if (requestCount === 1) return new Response(null, { status: 204 });
    return new Response([
      'data: {"type":"RUN_STARTED","threadId":"chat-1","runId":"run-1"}',
      "",
      'data: {"type":"RUN_FINISHED","threadId":"chat-1","runId":"run-1"}',
      "",
    ].join("\n"), {
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;

  for await (const event of durableSubscriptionEvents({
    chatId: "chat-1",
    getKnownRunIds: () => [],
    signal: abortController.signal,
    retryDelayMs: 0,
    fetcher,
  })) {
    events.push(event.type);
    if (event.type === "RUN_FINISHED") abortController.abort();
  }

  assert.equal(requestCount, 2);
  assert.deepEqual(events, ["RUN_STARTED", "RUN_FINISHED"]);
});
