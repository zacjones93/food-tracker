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
import { requireAiAccess } from "@/lib/ai/permissions";
import { checkDailyUsageLimit } from "@/lib/ai/access-control";
import { trackUsage } from "@/lib/ai/cost-tracking";
import { getOrCreateChat, upsertMessage, getChat, updateChatTitle } from "@/lib/ai/chat-actions";
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

// Export UIMessage type for frontend use
export type MyUIMessage = UIMessage<
  never,
  never,
  InferUITools<AllTools>
>;

export async function POST(req: Request): Promise<Response> {
  console.log("🚀 =================================================");
  console.log("🚀 POST /api/chat called");
  console.log("🚀 =================================================");

  try {
    // Auth & permission check
    const { session, settings } = await requireAiAccess();
    console.log("✅ Auth check passed:", session.user.id);

    // Check daily rate limit
    const usageLimit = await checkDailyUsageLimit(
      session.activeTeamId!,
      settings.maxRequestsPerDay
    );

    if (!usageLimit.withinLimit) {
      return new Response(
        JSON.stringify({
          error: `Daily limit reached (${settings.maxRequestsPerDay} requests/day)`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get database instance
    const db = getDB();

    // Parse and validate request
    const body = (await req.json()) as { chatId?: string; messages: UIMessage[] };
    console.log("📥 Request body:", {
      chatId: body.chatId,
      messageCount: body.messages?.length || 0,
      lastMessageRole: body.messages?.[body.messages.length - 1]?.role
    });

    if (!body.chatId) {
      console.error("❌ No chatId in request body");
      return new Response(
        JSON.stringify({ error: "chatId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const chatId: string = body.chatId;
    console.log("✅ Using chatId:", chatId);

    let messages: UIMessage[];
    try {
      messages = await validateUIMessages({
        messages: body.messages,
      });
    } catch {
      return new Response("Invalid messages", { status: 400 });
    }

    // Lazily create chat if it doesn't exist
    await getOrCreateChat({
      chatId,
      userId: session.user.id,
      teamId: session.activeTeamId!,
    });

    // Save the new user message BEFORE calling AI
    // The last message in the array should be the user's new message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "user") {
      console.log("💾 Saving user message before AI call:", lastMessage.id);
      try {
        await upsertMessage({ message: lastMessage as MyUIMessage, chatId });
        console.log("✅ User message saved");
      } catch (error) {
        console.error("❌ Failed to save user message:", error);
      }
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
      system: `You are a meal planning assistant for Food Tracker. Your role is to help users manage their recipes and weekly meal schedules efficiently.

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
            teamId: session.activeTeamId!,
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
          console.error("Failed to track usage:", error);
        }
      },
    });

    // Convert to UI message stream
    const stream = result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId, // Server-side ID generation
      onFinish: async ({ messages: allMessages }) => {
        console.log("🎯 =================================================");
        console.log("🎯 toUIMessageStream.onFinish CALLED");
        console.log("🎯 =================================================");
        console.log("🎯 Total messages:", allMessages.length, "Original:", messages.length);

        // Only save ASSISTANT messages (user message already saved above)
        // allMessages = originalMessages + new assistant messages
        // We saved the user message before the AI call, so only save assistant responses here
        const newMessages = allMessages.slice(messages.length);

        console.log("🎯 New messages to save:", newMessages.map(m => ({
          id: m.id,
          role: m.role,
          partsCount: m.parts?.length || 0,
          partTypes: m.parts?.map(p => p.type).join(', ') || 'none'
        })));

        // Persist only new messages to database
        try {
          let savedCount = 0;
          let skippedCount = 0;

          for (const message of newMessages) {
            console.log(`🎯 Processing NEW message ${message.id} (${message.role}) with ${message.parts?.length || 0} parts`);

            try {
              await upsertMessage({ message: message as MyUIMessage, chatId });
              savedCount++;
              console.log(`✅ Saved message ${message.id}`);
            } catch (err) {
              skippedCount++;
              console.error(`❌ Failed to save message ${message.id}:`, err);
            }
          }

          console.log(`🎯 Persistence complete: ${savedCount} saved, ${skippedCount} skipped`);

          // Auto-generate title if this is the first exchange
          const chat = await getChat(chatId);
          if (chat && !chat.title && allMessages.length >= 2) {
            console.log("🏷️  Generating title for new chat:", chatId);
            const title = await generateChatTitle(allMessages);
            console.log("✅ Generated title:", title);
            await updateChatTitle({ chatId, title });
          }
        } catch (error) {
          console.error("❌ Fatal error in persistence loop:", error);
        }

        console.log("🎯 =================================================");
      },
    });

    // Return streaming response
    return createUIMessageStreamResponse({
      stream,
      headers: {
        "Content-Encoding": "identity", // Critical for Cloudflare streaming!
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
