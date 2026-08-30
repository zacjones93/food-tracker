import { uiMessagesToWire, type ModelMessage } from "@tanstack/ai/client";
import type {
  RunAgentInputContext,
  SubscribeConnectionAdapter,
  UIMessage,
} from "@tanstack/ai-react";

import { durableSubscriptionEvents } from "./durable-stream";

interface DurableAssistantConnectionOptions {
  chatId: string;
  getKnownRunIds: () => string[];
}

interface DurableAssistantConnection {
  connection: SubscribeConnectionAdapter;
  cancelActiveRun: () => Promise<void>;
}

function assistantRequestBody({
  messages,
  data,
  runContext,
}: {
  messages: Array<UIMessage> | Array<ModelMessage>;
  data?: Record<string, unknown>;
  runContext: RunAgentInputContext;
}): Record<string, unknown> {
  const forwardedProps = {
    ...(runContext.forwardedProps ?? {}),
    ...(data ?? {}),
  };
  return {
    threadId: runContext.threadId,
    runId: runContext.runId,
    ...(runContext.parentRunId ? { parentRunId: runContext.parentRunId } : {}),
    ...(runContext.resume ? { resume: runContext.resume } : {}),
    state: {},
    messages: uiMessagesToWire(messages as Array<UIMessage>),
    tools: runContext.clientTools ?? [],
    context: [],
    forwardedProps,
    data: forwardedProps,
  };
}

export function createDurableAssistantConnection({
  chatId,
  getKnownRunIds,
}: DurableAssistantConnectionOptions): DurableAssistantConnection {
  let activeRunId: string | null = null;

  return {
    connection: {
      async *subscribe(signal) {
        for await (const event of durableSubscriptionEvents({
          chatId,
          getKnownRunIds,
          signal,
        })) {
          if (event.type === "RUN_STARTED") activeRunId = event.runId;
          if (
            (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") &&
            (!("runId" in event) || event.runId === activeRunId)
          ) {
            activeRunId = null;
          }
          yield event;
        }
      },
      async send(messages, data, _signal, runContext) {
        if (!runContext) throw new Error("Assistant run context is required");
        activeRunId = runContext.runId;
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(assistantRequestBody({
            messages,
            data,
            runContext,
          })),
        });
        if (!response.ok) {
          activeRunId = null;
          throw new Error(`Assistant request failed with status ${response.status}`);
        }
      },
    },
    async cancelActiveRun() {
      if (!activeRunId) return;
      const response = await fetch("/api/assistant/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, runId: activeRunId }),
      });
      if (!response.ok) {
        throw new Error(`Unable to stop assistant run (${response.status})`);
      }
      activeRunId = null;
    },
  };
}
