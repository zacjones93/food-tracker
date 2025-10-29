import Link from "next/link";
import type { SearchRecipesResult } from "./types";

export const SearchRecipesPart = ({ result }: { result: SearchRecipesResult | undefined }) => {
  const recipes = result?.recipes || [];
  const count = result?.count || 0;

  return (
    <div className="bg-green-950/80 border-2 border-green-500 rounded-lg p-3 text-sm">
      <div className="font-semibold text-green-100 mb-2 flex items-center gap-2">
        🔍 Found {count} recipe{count !== 1 ? 's' : ''}
      </div>
      {recipes.length > 0 && (
        <div className="space-y-1 text-xs">
          {recipes.slice(0, 5).map((recipe, idx) => (
            <Link
              key={idx}
              href={`/recipes/${recipe.id}`}
              className="text-green-50 flex items-center gap-2 hover:bg-green-900/50 rounded px-2 py-1 -mx-2 transition-colors group"
            >
              <span>{recipe.emoji || '🍽️'}</span>
              <span className="font-medium group-hover:underline">{recipe.name}</span>
              {recipe.mealType && (
                <span className="text-green-200">• {recipe.mealType}</span>
              )}
              {recipe.difficulty && (
                <span className="text-green-200">• {recipe.difficulty}</span>
              )}
              <span className="text-green-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>
          ))}
          {recipes.length > 5 && (
            <div className="text-green-200 italic px-2">
              ...and {recipes.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};
