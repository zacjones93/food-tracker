import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/tanstack-ai";
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
import { CODE_MODE_DESCRIPTION } from "./code-mode-contract";
import { getWorkerAssistantErrorMessage } from "./errors";
import {
  assertAuthorizedChat,
  createPersistenceMiddleware,
  persistMessage,
  startRun,
} from "./persistence";
import {
  createCodeModeToolProviders,
  createReadOnlyToolNamespaces,
} from "./tools";
import { assertReadOnlyToolNamespaces } from "./tool-policy";
import { createApprovedMutationTool } from "./mutation-tool";

function createSystemPrompt({
  today,
  resolvedPageContext,
}: {
  today: Date;
  resolvedPageContext: string | null;
}): string {
  const currentDate = today.toISOString().slice(0, 10);
  return `You are List To Ladle's meal-planning assistant.
Use Code Mode whenever retrieval requires one or more food-planning lookups.
Only inspect the authenticated active team's data through the provided tools. Global recipe books and the global default grocery template are readable but never writable.
Inside Code Mode, use the declared recipes, weeks, recipeBooks, groceryTemplates, groceryItems, weekRecipes, recipeRelations, and settings namespaces. Never call codemode.* and never shadow a namespace global with a local variable.
Every retrieval call returns {ok:true,data:{...}} or {ok:false,error:{...}}. It never returns a bare array. Search arrays are response.data.items; recipe-week matches are response.data.matches.
The additional food-planning namespaces return {items,count} directly.
recipes.getMany requires recipe IDs. For exact titles, search first, match names case-insensitively, then pass the matching IDs.
The current UTC date is ${currentDate}. For "current week" or "this week", search weeks with onDate set to this date; a stored status of current is not authoritative because imported data can contain multiple current rows.
If more than one returned date range contains the current date, explain the ambiguity instead of trusting status labels.
If generated code fails, correct it using the declared contracts and examples; do not repeat the same code.
For create, update, or delete requests, retrieve the exact team-owned IDs first and then call apply_team_changes with the smallest complete change set. Never claim a write succeeded until the approval-required tool returns success.
Do not request account, membership, billing, AI-budget, or admin mutations; they are outside the assistant's authority.
Keep answers concise and cite recipe or week names returned by tools.${
    resolvedPageContext
      ? `\n\n## Attached Page Context\n\n${resolvedPageContext}`
      : ""
  }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getResolvedPageContext(requestBody: unknown): string | null {
  if (!isRecord(requestBody) || !isRecord(requestBody.forwardedProps)) {
    return null;
  }
  const context = requestBody.forwardedProps.resolvedPageContext;
  return typeof context === "string" && context.length <= 200_000
    ? context
    : null;
}

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
  const mutationTool = createApprovedMutationTool({ db: env.DB, context });
  const executor = new DynamicWorkerExecutor({
    loader: env.LOADER,
    globalOutbound: null,
    timeout: 10_000,
  });
  const unsafeCodeTool = createCodeTool({
    executor,
    tools: createCodeModeToolProviders(namespaces),
    description: CODE_MODE_DESCRIPTION,
  });
  if (!unsafeCodeTool.execute) {
    throw new AssistantWorkerError("CODE_MODE_UNAVAILABLE", "Assistant retrieval is unavailable", 503);
  }
  const executeCode = unsafeCodeTool.execute;
  const codeTool = {
    ...unsafeCodeTool,
    async execute(...args: Parameters<typeof executeCode>) {
      try {
        return await executeCode(...args);
      } catch {
        throw new Error(getWorkerAssistantErrorMessage("CODE_MODE_EXECUTION_FAILED"));
      }
    },
  };
  const abortController = new AbortController();
  signal.addEventListener("abort", () => abortController.abort(signal.reason), { once: true });
  const adapter = createWorkersAiChat(env.AI_MODEL, { binding: env.AI });
  const stream = chat({
    adapter,
    messages: params.messages,
    systemPrompts: [
      createSystemPrompt({
        today: new Date(),
        resolvedPageContext: getResolvedPageContext(requestBody),
      }),
    ],
    tools: [codeTool, mutationTool],
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
