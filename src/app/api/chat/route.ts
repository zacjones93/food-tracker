import "server-only";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { requireAiAccess } from "@/lib/ai/permissions";
import { checkDailyUsageLimit } from "@/lib/ai/access-control";
import { createRecipeTools } from "@/lib/ai/tools/recipe-tools";
import { createScheduleTools } from "@/lib/ai/tools/schedule-tools";
import { trackUsage } from "@/lib/ai/cost-tracking";

export const runtime = "nodejs"; // OpenNext uses Node runtime

export async function POST(req: Request) {
  try {
    // Auth & permission check
    const { session, settings } = await requireAiAccess();

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

    // Get Cloudflare bindings
    const { env } = await getCloudflareContext();
    const db = drizzle(env.NEXT_TAG_CACHE_D1);

    // Parse request
    const { messages } = await req.json();

    // Get or create conversation ID
    const conversationId = req.headers.get("x-conversation-id") ?? undefined;

    // Combine tools from all modules
    const recipeTools = createRecipeTools(db, session.activeTeamId!);
    const scheduleTools = createScheduleTools(db, session.activeTeamId!);

    // Use Gemini 2.5 Flash for balanced speed and cost
    const modelName = "gemini-2.5-flash";

    // Stream AI response
    const result = await streamText({
      model: google(modelName),
      messages,
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
      tools: {
        ...recipeTools,
        ...scheduleTools,
      },
      maxTokens: settings.maxTokensPerRequest,
      maxSteps: 5, // Limit tool call iterations
      onFinish: async ({ usage, finishReason }) => {
        // Track usage in database
        try {
          await trackUsage(db, {
            userId: session.user.id,
            teamId: session.activeTeamId!,
            model: modelName,
            endpoint: "/api/chat",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            finishReason,
            conversationId,
          });
        } catch (error) {
          console.error("Failed to track AI usage:", error);
          // Don't fail the request if tracking fails
        }
      },
    });

    // Return streaming response with proper headers
    return result.toDataStreamResponse({
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
