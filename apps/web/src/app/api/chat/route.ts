import "server-only";
import {
  streamText,
  createIdGenerator,
  convertToModelMessages,
  validateUIMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  type UIMessage,
  type InferUITools,
} from "ai";
import { google } from "@ai-sdk/google";
import {
  aiErrorResponse,
  createAiRequestError,
  isAiRequestError,
  requireAiAccess,
} from "@/lib/ai/permissions";
import {
  checkDailyUsageLimit,
  checkMonthlyBudgetLimit,
} from "@/lib/ai/access-control";
import { trackUsage } from "@/lib/ai/cost-tracking";
import {
  getAuthorizedChat,
  getOrCreateChat,
  upsertMessage,
  updateChatTitle,
} from "@/lib/ai/chat-actions";
import { getDB } from "@/db/index";
import { createRecipeTools } from "@/lib/ai/tools/recipe-tools";
import { createScheduleTools } from "@/lib/ai/tools/schedule-tools";
import { generateChatTitle } from "@/lib/ai/title-generation";

export const runtime = "nodejs"; // OpenNext uses Node runtime

// Type inference for tools
type RecipeTools = Awaited<ReturnType<typeof createRecipeTools>>;
type ScheduleTools = Awaited<ReturnType<typeof createScheduleTools>>;
type AllTools = RecipeTools & ScheduleTools;

// Extended usage type for models that support reasoning/caching
interface ExtendedUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

interface AiLogContext {
  requestId: string;
  runId: string;
  chatId?: string;
}

function getRequestId(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim();
  if (candidate && candidate.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(candidate)) {
    return candidate;
  }

  return crypto.randomUUID();
}

function logAiEvent({
  level,
  event,
  context,
  details,
}: {
  level: "info" | "warn" | "error";
  event: string;
  context: AiLogContext;
  details?: Record<string, unknown>;
}): void {
  console[level](
    JSON.stringify({
      scope: "legacy-ai-chat",
      event,
      requestId: context.requestId,
      runId: context.runId,
      ...(context.chatId ? { chatId: context.chatId } : {}),
      ...details,
    }),
  );
}

// Export UIMessage type for frontend use
export type MyUIMessage = UIMessage<
  never,
  never,
  InferUITools<AllTools>
>;

export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req);
  const runId = crypto.randomUUID();
  const logContext: AiLogContext = { requestId, runId };
  logAiEvent({ level: "info", event: "request.started", context: logContext });

  try {
    // Auth & permission check
    const { session, settings } = await requireAiAccess();
    const teamId = session.activeTeamId!;
    logAiEvent({ level: "info", event: "authorization.succeeded", context: logContext });

    // Check daily rate limit
    const usageLimit = await checkDailyUsageLimit(
      teamId,
      settings.maxRequestsPerDay
    );

    if (!usageLimit.withinLimit) {
      throw createAiRequestError({
        code: "DAILY_LIMIT_REACHED",
        message: `Daily limit reached (${settings.maxRequestsPerDay} requests/day)`,
        status: 429,
      });
    }

    const monthlyBudget = await checkMonthlyBudgetLimit({
      teamId,
      monthlyBudgetUsd: settings.monthlyBudgetUsd,
    });

    if (!monthlyBudget.withinLimit) {
      throw createAiRequestError({
        code: "MONTHLY_BUDGET_REACHED",
        message: "Monthly AI budget reached",
        status: 429,
      });
    }

    // Get database instance
    const db = getDB();

    // Parse and validate request
    let body: { chatId?: string; messages?: UIMessage[] };
    try {
      body = (await req.json()) as { chatId?: string; messages?: UIMessage[] };
    } catch (error) {
      throw createAiRequestError({
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
        status: 422,
        cause: error,
      });
    }

    if (!body.chatId?.trim()) {
      throw createAiRequestError({
        code: "INVALID_CHAT_ID",
        message: "chatId is required",
        status: 422,
      });
    }

    if (!Array.isArray(body.messages)) {
      throw createAiRequestError({
        code: "INVALID_MESSAGES",
        message: "messages must be an array",
        status: 422,
      });
    }

    const chatId = body.chatId.trim();
    logContext.chatId = chatId;

    let messages: UIMessage[];
    try {
      messages = await validateUIMessages({
        messages: body.messages,
      });
    } catch (error) {
      throw createAiRequestError({
        code: "INVALID_MESSAGES",
        message: "Invalid messages",
        status: 422,
        cause: error,
      });
    }

    // Lazily create chat if it doesn't exist
    await getOrCreateChat({
      chatId,
      userId: session.user.id,
      teamId,
    });

    // Save the new user message BEFORE calling AI
    // The last message in the array should be the user's new message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "user") {
      await upsertMessage({
        message: lastMessage as MyUIMessage,
        chatId,
        userId: session.user.id,
        teamId,
      });
    }

    // Use Gemini 2.5 Flash for balanced speed and cost
    const modelName = "gemini-2.5-flash";

    // Create tools with per-request database and session context
    const recipeTools = await createRecipeTools(db);
    const scheduleTools = await createScheduleTools(db);
    const tools = {
      ...recipeTools,
      ...scheduleTools,
    };

    // Server-side ID generator for messages
    const generateMessageId = createIdGenerator({
      prefix: "msg",
      size: 16,
    });

    // Stream AI response
    const result = streamText({
      model: google(modelName),
      messages: convertToModelMessages(messages),
      maxOutputTokens: settings.maxTokensPerRequest,
      system: `You are a meal planning assistant for List To Ladle. Your role is to help users manage their recipes and weekly meal schedules efficiently.

## Your Capabilities

You can help users:
1. **Search & Browse Recipes**: Find recipes by name, meal type (breakfast/lunch/dinner/snack/dessert/appetizer), difficulty (easy/medium/hard), or tags (e.g., vegetarian, quick, healthy)
2. **Add New Recipes**: Create recipes with name, emoji, meal type, difficulty, ingredients, instructions, and tags
3. **Update Recipes**: Modify recipe metadata like name, emoji, tags, meal type, or difficulty
4. **Search Weeks**: Find meal schedules by status (current/upcoming/archived), view assigned recipes
5. **Update Weeks**: Change week status, dates, name, or emoji

## Guidelines

**When users ask about recipes:**
- Use \`search_recipes\` to find existing recipes first before suggesting they add new ones
- Pay attention to filters: mealType, difficulty, tags
- Suggest relevant meal types for the time of day or context
- When adding recipes, always include an appropriate emoji and meal type

**When users ask about meal planning:**
- Use \`search_weeks\` with status filter: "current" for this week, "upcoming" for future weeks, "archived" for past weeks
- Include recipes in the response to show what's already planned
- Help organize meals by suggesting appropriate meal types for different days
- When updating weeks, use \`update_week\` to change status or details

**When users want to modify data:**
- Always confirm the specific recipe or week to update before making changes
- For recipes: use \`update_recipe_metadata\` (don't modify ingredients or full recipe body)
- For weeks: use \`update_week\` (don't modify assigned recipes, only metadata)
- Return success confirmations with details about what was changed

**Best Practices:**
- Be proactive: if a user asks "what should I make for dinner?", search their recipes for dinner options
- Be specific: when showing results, include emoji, meal type, and tags to help users identify recipes
- Be helpful: suggest ways to organize recipes (by tags, meal type) or plan weeks efficiently
- Stay focused: only help with food scheduling tasks - recipes, meals, and weekly planning

**Tone:**
- Friendly and conversational
- Concise responses (don't over-explain)
- Use food emojis when relevant
- Focus on actionable suggestions`,
      tools: tools,
      stopWhen: stepCountIs(10),// Limit tool call iterations
      onFinish: async ({ usage, finishReason }) => {
        // Track usage (happens after streaming completes)
        try {
          const extendedUsage = usage as unknown as ExtendedUsage;
          await trackUsage(db, {
            userId: session.user.id,
            teamId,
            model: modelName,
            endpoint: "/api/chat",
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            reasoningTokens: extendedUsage.reasoningTokens || 0,
            cachedInputTokens: extendedUsage.cachedInputTokens || 0,
            finishReason,
            conversationId: chatId,
          });
        } catch (error) {
          logAiEvent({
            level: "error",
            event: "usage.persistence_failed",
            context: logContext,
            details: { errorName: error instanceof Error ? error.name : "UnknownError" },
          });
        }

        logAiEvent({
          level: "info",
          event: "run.finished",
          context: logContext,
          details: {
            finishReason,
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
          },
        });
      },
    });

    // Convert to UI message stream
    const stream = result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId, // Server-side ID generation
      onFinish: async ({ messages: allMessages }) => {
        // Only save ASSISTANT messages (user message already saved above)
        // allMessages = originalMessages + new assistant messages
        // We saved the user message before the AI call, so only save assistant responses here
        const newMessages = allMessages.slice(messages.length);
        logAiEvent({
          level: "info",
          event: "persistence.started",
          context: logContext,
          details: { messageCount: newMessages.length },
        });

        // Persist only new messages to database
        try {
          let savedCount = 0;
          let skippedCount = 0;

          for (const message of newMessages) {
            try {
              await upsertMessage({
                message: message as MyUIMessage,
                chatId,
                userId: session.user.id,
                teamId,
              });
              savedCount++;
            } catch (err) {
              skippedCount++;
              logAiEvent({
                level: "error",
                event: "persistence.message_failed",
                context: logContext,
                details: {
                  role: message.role,
                  errorName: err instanceof Error ? err.name : "UnknownError",
                },
              });
            }
          }

          logAiEvent({
            level: skippedCount > 0 ? "warn" : "info",
            event: "persistence.finished",
            context: logContext,
            details: { savedCount, skippedCount },
          });

          // Auto-generate title if this is the first exchange
          const chat = await getAuthorizedChat({
            chatId,
            userId: session.user.id,
            teamId,
          });
          if (chat && !chat.title && allMessages.length >= 2) {
            const title = await generateChatTitle(allMessages);
            await updateChatTitle({
              chatId,
              title,
              userId: session.user.id,
              teamId,
            });
            logAiEvent({
              level: "info",
              event: "title.generated",
              context: logContext,
            });
          }
        } catch (error) {
          logAiEvent({
            level: "error",
            event: "persistence.failed",
            context: logContext,
            details: { errorName: error instanceof Error ? error.name : "UnknownError" },
          });
        }
      },
    });

    // Return streaming response
    return createUIMessageStreamResponse({
      stream,
      headers: {
        "Content-Encoding": "identity", // Critical for Cloudflare streaming!
        "x-request-id": requestId,
        "x-run-id": runId,
      },
    });
  } catch (error) {
    const requestError = isAiRequestError(error) ? error : undefined;
    logAiEvent({
      level: "error",
      event: "request.failed",
      context: logContext,
      details: {
        code: requestError?.code ?? "INTERNAL_ERROR",
        status: requestError?.status ?? 500,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });
    return aiErrorResponse({ error, requestId, runId });
  }
}
