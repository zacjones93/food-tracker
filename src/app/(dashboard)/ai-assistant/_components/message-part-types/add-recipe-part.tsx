import type { AddRecipeResult } from "./types";

export const AddRecipePart = ({ result }: { result: AddRecipeResult | undefined }) => {
  return (
    <div className="bg-purple-950/80 border-2 border-purple-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-purple-100 mb-1">
        ✅ Recipe added successfully
      </div>
      {result?.recipe && (
        <div className="text-purple-50 flex items-center gap-2 text-sm">
          <span className="text-lg">{result.recipe.emoji || '🍽️'}</span>
          <span className="font-medium">{result.recipe.name}</span>
          {result.recipe.mealType && (
            <span className="text-purple-200 text-xs">• {result.recipe.mealType}</span>
          )}
        </div>
      )}
    </div>
  );
};
