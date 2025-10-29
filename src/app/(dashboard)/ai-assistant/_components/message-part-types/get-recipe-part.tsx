import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CollapsibleContent } from "../collapsible-content";
import type { GetRecipeResult, RecipeIngredient } from "./types";
import { formatDisplayDate } from "./date-utils";

export const GetRecipePart = ({ result }: { result: GetRecipeResult | undefined }) => {
  const recipe = result?.recipe;

  if (!recipe) {
    return (
      <div className="bg-red-950/80 border-2 border-red-500 rounded-lg p-3 text-sm">
        <div className="font-semibold text-red-100">
          ❌ Recipe not found
        </div>
        {result?.error && (
          <div className="text-red-200 text-xs mt-1">
            {result.error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-indigo-950/90 border-2 border-indigo-400 rounded-lg p-4 text-sm">
      {/* Recipe header */}
      <div className="flex items-start gap-3 mb-3 border-b border-indigo-600/50 pb-3">
        <span className="text-3xl">{recipe.emoji || '🍽️'}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-indigo-100 text-lg mb-1">
            {recipe.name}
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {recipe.mealType && (
              <span className="bg-indigo-500 text-white px-2 py-1 rounded font-medium">
                {recipe.mealType}
              </span>
            )}
            {recipe.difficulty && (
              <span className="bg-purple-500 text-white px-2 py-1 rounded font-medium">
                {recipe.difficulty}
              </span>
            )}
            {recipe.tags && recipe.tags.length > 0 && (
              recipe.tags.map((tag, idx) => (
                <span key={idx} className="bg-indigo-600 text-white px-2 py-1 rounded font-medium">
                  {tag}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ingredients */}
      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <div className="mb-3">
          <h4 className="font-semibold text-indigo-200 text-sm mb-2">📝 Ingredients</h4>
          <CollapsibleContent maxHeight="4rem">
            <div className="space-y-1 text-indigo-100 text-xs">
              {recipe.ingredients.map((ingredient: RecipeIngredient, idx: number) => (
                <div key={idx} className="ml-2">
                  {ingredient.items ? (
                    ingredient.items.map((item: string, itemIdx: number) => (
                      <div key={itemIdx}>• {item}</div>
                    ))
                  ) : (
                    <div>• {JSON.stringify(ingredient)}</div>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      )}

      {/* Instructions */}
      {recipe.recipeBody && (
        <div className="mb-3">
          <h4 className="font-semibold text-indigo-200 text-sm mb-2">👨‍🍳 Instructions</h4>
          <CollapsibleContent maxHeight="6rem">
            <div className="prose prose-sm prose-invert max-w-none text-indigo-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {recipe.recipeBody}
              </ReactMarkdown>
            </div>
          </CollapsibleContent>
        </div>
      )}

      {/* Recipe link */}
      {recipe.recipeLink && (
        <div className="mb-3">
          <h4 className="font-semibold text-indigo-200 text-sm mb-1">🔗 Source</h4>
          <a
            href={recipe.recipeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-300 hover:text-indigo-200 text-xs underline"
          >
            {recipe.recipeLink}
          </a>
        </div>
      )}

      {/* Recipe book reference */}
      {recipe.recipeBookId && (
        <div className="mb-3 text-indigo-200 text-xs">
          📖 Book ID: {recipe.recipeBookId}
          {recipe.page && ` (Page ${recipe.page})`}
        </div>
      )}

      {/* Stats */}
      {(recipe.lastMadeDate || (recipe.mealsEatenCount && recipe.mealsEatenCount > 0)) && (
        <div className="flex gap-4 text-xs text-indigo-200 pt-2 border-t border-indigo-600/50">
          {recipe.lastMadeDate && (
            <div>
              🕐 Last made: {formatDisplayDate(recipe.lastMadeDate)}
            </div>
          )}
          {recipe.mealsEatenCount && recipe.mealsEatenCount > 0 && (
            <div>
              🍴 Made {recipe.mealsEatenCount} time{recipe.mealsEatenCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
