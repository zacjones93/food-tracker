import Link from "next/link";
import type { AddRecipeToScheduleResult } from "./types";
import { formatDisplayDate } from "./date-utils";

export const AddRecipeToSchedulePart = ({ result }: { result: AddRecipeToScheduleResult | undefined }) => {
  if (!result?.success) {
    return (
      <div className="bg-red-950/80 border-2 border-red-500 rounded-lg p-3 text-sm">
        <div className="font-semibold text-red-100">
          ❌ Failed to add recipe to schedule
        </div>
        {result?.error && (
          <div className="text-red-200 text-xs mt-1">
            {result.error}
          </div>
        )}
      </div>
    );
  }

  const { recipe, week, weekRecipe, message } = result;

  return (
    <div className="bg-green-950/80 border-2 border-green-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-green-100 mb-2">
        ✅ Recipe added to schedule
      </div>

      {message && (
        <div className="text-green-50 text-xs mb-2">
          {message}
        </div>
      )}

      {recipe && week && (
        <div className="space-y-2 text-xs">
          {/* Recipe info */}
          <Link
            href={`/recipes/${recipe.id}`}
            className="flex items-center gap-2 bg-green-900/50 rounded p-2 hover:bg-green-800/50 transition-colors"
          >
            <span className="text-lg">{recipe.emoji || '🍽️'}</span>
            <div className="flex-1">
              <div className="font-semibold text-green-100 hover:underline">{recipe.name}</div>
              {recipe.mealType && (
                <div className="text-green-200 text-xs">{recipe.mealType}</div>
              )}
            </div>
            <span className="text-green-300 text-xs">→</span>
          </Link>

          {/* Week info */}
          <Link
            href={`/schedule/${week.id}`}
            className="flex items-center gap-2 bg-green-900/50 rounded p-2 hover:bg-green-800/50 transition-colors"
          >
            <span className="text-lg">📅</span>
            <div className="flex-1">
              <div className="font-semibold text-green-100 hover:underline">
                {week.emoji && `${week.emoji} `}{week.name}
              </div>
              {week.startDate && week.endDate && (
                <div className="text-green-200 text-xs">
                  {formatDisplayDate(week.startDate)} - {formatDisplayDate(week.endDate)}
                </div>
              )}
            </div>
            <span className="text-green-300 text-xs">→</span>
          </Link>

          {/* Scheduled date if specified */}
          {weekRecipe?.scheduledDate && (
            <div className="flex items-center gap-2 bg-green-900/50 rounded p-2">
              <span className="text-lg">🗓️</span>
              <div className="flex-1">
                <div className="text-green-100">
                  Scheduled for: <span className="font-semibold">{formatDisplayDate(weekRecipe.scheduledDate)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
