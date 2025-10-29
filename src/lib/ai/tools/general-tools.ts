import "server-only";
import * as z4 from "zod/v4";
import { tool } from "ai";

/**
 * General-purpose tools for the AI assistant that don't require database access
 * or team context. These tools provide utility functionality like time, date,
 * and other contextual information.
 */
export function createGeneralTools() {
  return {
    get_user_time: tool({
      description:
        "Get the current date and time in the user's timezone. Use this when users ask temporal questions like 'what should I make for dinner tonight?' or 'what's for breakfast?'. Returns current time with context like day of week and time of day.",
      inputSchema: z4.object({
        timezone: z4
          .string()
          .optional()
          .describe(
            "IANA timezone identifier (e.g., 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo'). Defaults to 'America/Los_Angeles' if not provided."
          ),
      }),
      execute: async ({ timezone = "America/Los_Angeles" }: { timezone?: string }) => {
        try {
          // Get current time in the specified timezone
          const now = new Date();
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          const timeFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hour: "numeric",
            hour12: false,
          });

          const formattedTime = formatter.format(now);
          const hour = parseInt(timeFormatter.format(now));

          // Determine time of day
          let timeOfDay: string;
          let mealContext: string;
          if (hour >= 5 && hour < 12) {
            timeOfDay = "morning";
            mealContext = "breakfast";
          } else if (hour >= 12 && hour < 17) {
            timeOfDay = "afternoon";
            mealContext = "lunch";
          } else if (hour >= 17 && hour < 21) {
            timeOfDay = "evening";
            mealContext = "dinner";
          } else {
            timeOfDay = "night";
            mealContext = "late-night snack";
          }

          // Get day of week
          const dayFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            weekday: "long",
          });
          const dayOfWeek = dayFormatter.format(now);

          // Get ISO date for comparisons
          const isoDate = now.toLocaleDateString("en-CA", { timeZone: timezone });

          return {
            success: true,
            timezone,
            formattedTime,
            isoDate,
            hour,
            dayOfWeek,
            timeOfDay,
            mealContext,
            message: `It's currently ${formattedTime} (${timeOfDay}, typical ${mealContext} time)`,
          };
        } catch (error) {
          console.error("Error getting user time:", error);
          return {
            success: false,
            error: "Failed to get user time. Invalid timezone identifier.",
          };
        }
      },
    }),
  };
}
