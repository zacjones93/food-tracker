import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import {
  chat,
  chatParamsFromRequestBody,
  combineStrategies,
  maxIterations,
  toServerSentEventsResponse,
  type UIMessage,
} from "@tanstack/ai";

import { createAiModelOptions, createGeminiAdapter } from "./ai-model";
import { RECIPE_URL_IMPORT_POLICY } from "./assistant-policy";
import { AssistantWorkerError, type AssistantRequestContext } from "./context";
import { createAssistantCodeMode } from "./code-mode-tool";
import { createAssistantTextGuardMiddleware } from "./assistant-text";
import {
  assertAuthorizedChat,
  createPersistenceMiddleware,
  persistMessage,
  startRun,
} from "./persistence";
import { createReadOnlyToolNamespaces } from "./tools";
import { assertReadOnlyToolNamespaces } from "./tool-policy";
import { createApprovedMutationTool } from "./mutation-tool";
import {
  createApprovedRecipeUrlImportTool,
  createRecipeUrlTool,
} from "./recipe-url-tool";
import { loadTeamRecipeVocabulary } from "./recipe-vocabulary";

function createSystemPrompt({
  today,
  resolvedPageContext,
}: {
  today: Date;
  resolvedPageContext: string | null;
}): string {
  const currentDate = today.toISOString().slice(0, 10);
  return `You are List To Ladle's meal-planning assistant.
Use execute_typescript whenever retrieval requires one or more food-planning lookups.
Only inspect the authenticated active team's data through the provided tools. Global recipe books and the global default grocery template are readable but never writable.
Inside Code Mode, use only the external_* functions declared in the Code Execution Tool prompt. Do not invent namespaces or API names.
Every retrieval call returns {ok:true,data:{...}} or {ok:false,error:{...}}. It never returns a bare array. Search arrays are response.data.items; recipe-week matches are response.data.matches.
The additional food-planning lookups return {items,count} directly.
external_recipeGetMany requires recipe IDs. For exact titles, search first, match names case-insensitively, then pass the matching IDs.
The current UTC date is ${currentDate}. For "current week" or "this week", search weeks with onDate set to this date; a stored status of current is not authoritative because imported data can contain multiple current rows.
If more than one returned date range contains the current date, explain the ambiguity instead of trusting status labels.
If generated code fails, correct it using the declared contracts and examples; do not repeat the same code.
Never show generated code, Code Mode source, tool-call JSON, tool arguments, or internal execution details to the user. Respond only with the user-facing result.
For create, update, or delete requests, retrieve the exact team-owned IDs first and then call apply_team_changes with the smallest complete change set. Never claim a write succeeded until the approval-required tool returns success.
${RECIPE_URL_IMPORT_POLICY}
When the user asks to remix, copy, or create a variation of an existing recipe, create a new recipe and set sourceRecipeId to the exact ID of the recipe it is based on. Leave the source recipe unchanged unless the user explicitly asks to edit it.
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

function lastUserMessage(
  messages: Array<UIMessage | { role: string }>,
): UIMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "user" &&
      "parts" in message &&
      Array.isArray(message.parts)
    ) {
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
    throw new AssistantWorkerError(
      "INVALID_MESSAGES",
      "Invalid assistant request",
      422,
    );
  }

  if (params.threadId !== context.chatId || params.runId !== context.runId) {
    throw new AssistantWorkerError(
      "CONTEXT_MISMATCH",
      "Assistant context mismatch",
      400,
    );
  }

  const userMessage = lastUserMessage(params.messages);
  if (!userMessage) {
    throw new AssistantWorkerError(
      "INVALID_MESSAGES",
      "A user message is required",
      422,
    );
  }
  await persistMessage({
    db: env.DB,
    chatId: context.chatId,
    message: userMessage,
  });
  await startRun({
    db: env.DB,
    context,
    model: env.AI_MODEL,
    promptVersion: env.PROMPT_VERSION,
  });

  const namespaces = createReadOnlyToolNamespaces({ db: env.DB, context });
  assertReadOnlyToolNamespaces(namespaces);
  const recipeUrlTool = createRecipeUrlTool({
    loadVocabulary: () => loadTeamRecipeVocabulary({ db: env.DB, context }),
  });
  const recipeUrlImportTool = createApprovedRecipeUrlImportTool({
    db: env.DB,
    context,
  });
  const mutationTool = createApprovedMutationTool({ db: env.DB, context });
  const executor = new DynamicWorkerExecutor({
    loader: env.LOADER,
    globalOutbound: null,
    timeout: 10_000,
  });
  const { tool: codeTool, systemPrompt: codeModeSystemPrompt } =
    createAssistantCodeMode({
      executor,
      namespaces,
    });
  const abortController = new AbortController();
  signal.addEventListener("abort", () => abortController.abort(signal.reason), {
    once: true,
  });
  const adapter = createGeminiAdapter({
    apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: env.AI_MODEL,
  });
  const stream = chat({
    adapter,
    messages: params.messages,
    systemPrompts: [
      createSystemPrompt({
        today: new Date(),
        resolvedPageContext: getResolvedPageContext(requestBody),
      }),
      codeModeSystemPrompt,
    ],
    tools: [codeTool, recipeUrlTool, recipeUrlImportTool, mutationTool],
    threadId: context.chatId,
    runId: context.runId,
    parentRunId: params.parentRunId,
    resume: params.resume,
    abortController,
    modelOptions: createAiModelOptions({
      maxOutputTokens: context.maxOutputTokens,
    }),
    agentLoopStrategy: combineStrategies([
      maxIterations(6),
      ({ toolCallCount }) => toolCallCount < 12,
    ]),
    middleware: [
      createAssistantTextGuardMiddleware(),
      createPersistenceMiddleware({ db: env.DB, context, model: env.AI_MODEL }),
    ],
  });

  return toServerSentEventsResponse(stream, {
    abortController,
    headers: {
      "x-request-id": context.requestId,
      "x-run-id": context.runId,
    },
  });
}
