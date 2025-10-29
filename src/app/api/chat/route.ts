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
import { createGeneralTools } from "@/lib/ai/tools/general-tools";
import { generateChatTitle } from "@/lib/ai/title-generation";

export const runtime = "nodejs"; // OpenNext uses Node runtime

// Type inference for tools
type RecipeTools = Awaited<ReturnType<typeof createRecipeTools>>;
type ScheduleTools = Awaited<ReturnType<typeof createScheduleTools>>;
type GeneralTools = ReturnType<typeof createGeneralTools>;
type AllTools = RecipeTools & ScheduleTools & GeneralTools;

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
    const generalTools = createGeneralTools();
    const tools = {
      ...recipeTools,
      ...scheduleTools,
      ...generalTools,
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
      system: `<task-context>
  You are a meal planning assistant for Food Tracker. Your role is to help users manage their recipes and weekly meal schedules efficiently. You are an assistant for a food tracking app so think about the best way to help the user with their food tracking goals. 

You can help users:
1. Search & Browse Recipes: Find recipes by name, meal type (breakfast/lunch/dinner/snack/dessert/appetizer), difficulty (easy/medium/hard), or tags (e.g., vegetarian, quick, healthy)
2. Add New Recipes: Create recipes with name, emoji, meal type, difficulty, ingredients, instructions, and tags
3. Update Recipes: Modify recipe metadata like name, emoji, tags, meal type, or difficulty
4. Search Weeks: Find meal schedules by status (current/upcoming/archived), view assigned recipes
5. Update Weeks: Change week status, dates, name, or emoji
6. Get Current Time: Check the user's local time and day for context-aware suggestions
</task-context>

<rules>
CRITICAL - Temporal Questions:
- ALWAYS call \`get_user_time\` FIRST when users ask time-specific questions like:
- "What should I make for dinner?" → Get time first to confirm it's dinner time
- "What's for breakfast?" → Verify it's morning in their timezone
- "What should I cook tonight?" → Check their local time/day
- "What can I make right now?" → Determine time of day for meal context
- The tool returns timezone-aware time with context (morning/afternoon/evening) and meal suggestions (breakfast/lunch/dinner)
- Use the \`mealContext\` from the response to filter recipes by appropriate meal type

When users ask about recipes:
- Use \`search_recipes\` to find existing recipes first before suggesting they add new ones
- Pay attention to filters: mealType, difficulty, tags
- Suggest relevant meal types for the time of day or context
- When adding recipes, always include an appropriate emoji and meal type

When users ask about meal planning:
- Use \`search_weeks\` with status filter: "current" for this week, "upcoming" for future weeks, "archived" for past weeks
- Include recipes in the response to show what's already planned
- Help organize meals by suggesting appropriate meal types for different days
- When updating weeks, use \`update_week\` to change status or details

When users want to modify data:
- Always confirm the specific recipe or week to update before making changes
- For recipes: use \`update_recipe_metadata\` (don't modify ingredients or full recipe body)
- For weeks: use \`update_week\` (don't modify assigned recipes, only metadata)
- Return success confirmations with details about what was changed
</rules>
## Guidelines

<best-practices>
- Be proactive: if a user asks "what should I make for dinner?", get their time first, then search their recipes for dinner options
- Be specific: when showing results, include emoji, meal type, and tags to help users identify recipes
- Be helpful: suggest ways to organize recipes (by tags, meal type) or plan weeks efficiently
- Stay focused: only help with food scheduling tasks - recipes, meals, and weekly planning
</best-practices>

<thinking-instructions>
Think about your answer first before you respond. Consider what the user is asking and what their goal is. Plan your next steps and what tools to use. If the ask is simple, don't over think your answer.
</thinking-instructions>

<tone>
- Friendly and conversational
- Concise responses (don't over-explain)
- Use food emojis when relevant
- Focus on actionable suggestions</tone>

<output-format>
Return two sections - a <thinking> block and an answer.
- The <thinking> block should contain your thought process, and be wrapped in a <thinking> tag.
- The answer should be unwrapped.
- The answer should be in markdown format.
- When referncing a week or recipe, link to the week or recipe in the answer.
- Always refer to recipes and weeks by name and link to their page.
  - e.g. 📅 Oct 26 - Nov 2, 2025, NOT <week_id>wk_ebuw4hirlb6cqkp2w769ok6u</week_id>
</output-format>`,
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
