import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool, tanstackTools } from "@cloudflare/codemode/tanstack-ai";
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import {
  chat,
  chatParamsFromRequestBody,
  combineStrategies,
  maxIterations,
  maxToolCalls,
  toServerSentEventsResponse,
  type UIMessage,
} from "@tanstack/ai";

import { AssistantWorkerError, type AssistantRequestContext } from "./context";
import {
  assertAuthorizedChat,
  createPersistenceMiddleware,
  persistMessage,
  startRun,
} from "./persistence";
import {
  createReadOnlyToolNamespaces,
} from "./tools";
import { assertReadOnlyToolNamespaces } from "./tool-policy";

const SYSTEM_PROMPT = `You are List To Ladle's read-only meal-planning assistant.
Use Code Mode whenever retrieval requires one or more recipe/week lookups.
Only inspect the authenticated team's recipes and weeks through the provided tools.
Never claim to create, update, or delete data. Explain that writes require an explicit future approval flow.
Keep answers concise and cite recipe or week names returned by tools.`;

function lastUserMessage(messages: Array<UIMessage | { role: string }>): UIMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && "parts" in message && Array.isArray(message.parts)) {
      return message;
    }
  }
  return null;
}

export async function runAssistant({
  requestBody,
  env,
  context,
  signal,
}: {
  requestBody: unknown;
  env: AssistantWorkerEnv;
  context: AssistantRequestContext;
  signal: AbortSignal;
}): Promise<Response> {
  await assertAuthorizedChat({ db: env.DB, context });

  let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>;
  try {
    params = await chatParamsFromRequestBody(requestBody);
  } catch {
    throw new AssistantWorkerError("INVALID_MESSAGES", "Invalid assistant request", 422);
  }

  if (params.threadId !== context.chatId || params.runId !== context.runId) {
    throw new AssistantWorkerError("CONTEXT_MISMATCH", "Assistant context mismatch", 400);
  }

  const userMessage = lastUserMessage(params.messages);
  if (!userMessage) {
    throw new AssistantWorkerError("INVALID_MESSAGES", "A user message is required", 422);
  }
  await persistMessage({ db: env.DB, chatId: context.chatId, message: userMessage });
  await startRun({
    db: env.DB,
    context,
    model: env.AI_MODEL,
    promptVersion: env.PROMPT_VERSION,
  });

  const namespaces = createReadOnlyToolNamespaces({ db: env.DB, context });
  assertReadOnlyToolNamespaces(namespaces);
  const executor = new DynamicWorkerExecutor({
    loader: env.LOADER,
    globalOutbound: null,
    timeout: 10_000,
  });
  const codeTool = createCodeTool({
    executor,
    tools: namespaces.map((namespace) => tanstackTools(namespace.tools, namespace.name)),
  });
  const abortController = new AbortController();
  signal.addEventListener("abort", () => abortController.abort(signal.reason), { once: true });
  const adapter = createWorkersAiChat(env.AI_MODEL, { binding: env.AI });
  const stream = chat({
    adapter,
    messages: params.messages,
    systemPrompts: [SYSTEM_PROMPT],
    tools: [codeTool],
    threadId: context.chatId,
    runId: context.runId,
    abortController,
    modelOptions: { max_tokens: context.maxOutputTokens },
    maxToolCallsPerTurn: 4,
    agentLoopStrategy: combineStrategies([maxIterations(6), maxToolCalls(12)]),
    middleware: [createPersistenceMiddleware({ db: env.DB, context, model: env.AI_MODEL })],
  });

  return toServerSentEventsResponse(stream, {
    abortController,
    headers: {
      "x-request-id": context.requestId,
      "x-run-id": context.runId,
    },
  });
}
