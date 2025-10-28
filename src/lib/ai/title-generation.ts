import "server-only";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { UIMessage } from "ai";

/**
 * Generate a concise title for a chat conversation
 * Uses Gemini Flash Lite for speed and low cost
 */
export async function generateChatTitle(
  messages: UIMessage[]
): Promise<string> {
  // Extract first user message and assistant response for context
  const userMessage = messages.find((m) => m.role === "user");
  const assistantMessage = messages.find((m) => m.role === "assistant");

  if (!userMessage) {
    return "New Chat";
  }

  // Get text content from message parts
  const getUserText = (msg: UIMessage): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join(" ");
  };

  const userText = getUserText(userMessage);
  const assistantText = assistantMessage ? getUserText(assistantMessage) : "";

  try {
    const result = await generateText({
      model: google("gemini-2.5-flash-lite"), // Fast & cheap for simple task
      prompt: `Generate a concise, descriptive title (max 5 words) for this conversation about food and meal planning:

User: ${userText}
${assistantText ? `Assistant: ${assistantText.substring(0, 200)}` : ""}

Title should:
- Be specific to the topic (e.g., "Vegetarian Dinner Ideas" not "Food Question")
- Use title case
- Be 2-5 words maximum
- No quotes or punctuation

Only return the title, no other text.

Title:`
    });

    const title = result.text.trim().replace(/^["']|["']$/g, ""); // Remove quotes

    // Fallback if too long
    if (title.length > 50) {
      return title.substring(0, 47) + "...";
    }

    return title || "New Chat";
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    // Fallback: Use first few words of user message
    const fallback = userText.split(" ").slice(0, 5).join(" ");
    return fallback.length > 50
      ? fallback.substring(0, 47) + "..."
      : fallback || "New Chat";
  }
}
