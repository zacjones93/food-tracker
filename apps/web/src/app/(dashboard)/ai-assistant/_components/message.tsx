import type { MyUIMessage } from "@/app/api/chat/route";
import type { Recipe, Week } from "@/db/schema";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CollapsibleContent } from "./collapsible-content";

// Tool result types - extend existing schema types where possible
interface RecipeIngredient {
  items?: string[];
  [key: string]: unknown;
}

interface SearchRecipesResult {
  count: number;
  recipes: Array<Pick<Recipe, 'id' | 'name' | 'emoji' | 'mealType' | 'difficulty' | 'tags' | 'lastMadeDate' | 'mealsEatenCount'>>;
}

interface AddRecipeResult {
  success: boolean;
  recipe?: Pick<Recipe, 'id' | 'name' | 'emoji' | 'mealType' | 'difficulty'>;
  message?: string;
  error?: string;
}

interface UpdateRecipeResult {
  success: boolean;
  message?: string;
  updates?: Record<string, unknown>;
  error?: string;
}

interface GetRecipeResult {
  success: boolean;
  recipe?: Pick<Recipe, 'id' | 'name' | 'emoji' | 'mealType' | 'difficulty' | 'tags' | 'ingredients' | 'recipeBody' | 'recipeLink' | 'recipeBookId' | 'page' | 'lastMadeDate' | 'mealsEatenCount'>;
  error?: string;
}

interface SearchWeeksResult {
  count: number;
  weeks: Array<
    Pick<Week, 'id' | 'name' | 'emoji' | 'status' | 'startDate' | 'endDate' | 'weekNumber'> & {
      recipes?: Array<{
        recipeId: string;
        name: string;
        emoji?: string;
        mealType?: string;
        made: boolean;
        order: number;
        scheduledDate?: Date;
      }>;
    }
  >;
}

interface UpdateWeekResult {
  success: boolean;
  message?: string;
  updates?: Record<string, unknown>;
  error?: string;
}

export const Message = ({ message }: { message: MyUIMessage }) => {
  const { role, parts } = message;

  // Extract clean text content (filtering is already done in message-mapping)
  const textContent = parts
    .filter((part) => part.type === 'text')
    .map((part) => part.type === 'text' ? part.text : '')
    .join('');

  return (
    <div className="flex flex-col gap-2">
      {/* Tool invocations - show FIRST so they appear above streaming text */}
      {parts.map((part, index) => {
        // Get full recipe
        if (part.type === 'tool-get_recipe') {
          const result = part.output as GetRecipeResult;
          const recipe = result?.recipe;

          if (!recipe) {
            return (
              <div
                key={index}
                className="bg-red-950/80 border-2 border-red-500 rounded-lg p-3 text-sm"
              >
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
            <div
              key={index}
              className="bg-indigo-950/90 border-2 border-indigo-400 rounded-lg p-4 text-sm"
            >
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
                      🕐 Last made: {new Date(recipe.lastMadeDate).toLocaleDateString()}
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
        }

        // Recipe search results
        if (part.type === 'tool-search_recipes') {
          const result = part.output as SearchRecipesResult;
          const recipes = result?.recipes || [];
          const count = result?.count || 0;

          return (
            <div
              key={index}
              className="bg-green-950/80 border-2 border-green-500 rounded-lg p-3 text-sm"
            >
              <div className="font-semibold text-green-100 mb-2 flex items-center gap-2">
                🔍 Found {count} recipe{count !== 1 ? 's' : ''}
              </div>
              {recipes.length > 0 && (
                <div className="space-y-1 text-xs">
                  {recipes.slice(0, 5).map((recipe, idx) => (
                    <div key={idx} className="text-green-50 flex items-center gap-2">
                      <span>{recipe.emoji || '🍽️'}</span>
                      <span className="font-medium">{recipe.name}</span>
                      {recipe.mealType && (
                        <span className="text-green-200">• {recipe.mealType}</span>
                      )}
                      {recipe.difficulty && (
                        <span className="text-green-200">• {recipe.difficulty}</span>
                      )}
                    </div>
                  ))}
                  {recipes.length > 5 && (
                    <div className="text-green-200 italic">
                      ...and {recipes.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Recipe added
        if (part.type === 'tool-add_recipe') {
          const result = part.output as AddRecipeResult;

          return (
            <div
              key={index}
              className="bg-purple-950/80 border-2 border-purple-500 rounded-lg p-3 text-sm"
            >
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
        }

        // Recipe updated
        if (part.type === 'tool-update_recipe_metadata') {
          const result = part.output as UpdateRecipeResult;

          return (
            <div
              key={index}
              className="bg-yellow-950/80 border-2 border-yellow-500 rounded-lg p-3 text-sm"
            >
              <div className="font-semibold text-yellow-100 mb-1">
                ✏️ Recipe updated
              </div>
              {result?.message && (
                <div className="text-yellow-50 text-xs mb-1">
                  {result.message}
                </div>
              )}
              {result?.updates && Object.keys(result.updates).length > 0 && (
                <div className="text-yellow-200 text-xs">
                  Updated: {Object.keys(result.updates).filter(k => k !== 'updatedAt').join(', ')}
                </div>
              )}
            </div>
          );
        }

        // Week search results
        if (part.type === 'tool-search_weeks') {
          const result = part.output as SearchWeeksResult;
          const weeks = result?.weeks || [];
          const count = result?.count || 0;

          return (
            <div
              key={index}
              className="bg-cyan-950/80 border-2 border-cyan-500 rounded-lg p-3 text-sm"
            >
              <div className="font-semibold text-cyan-100 mb-2 flex items-center gap-2">
                📅 Found {count} week{count !== 1 ? 's' : ''}
              </div>
              {weeks.length > 0 && (
                <div className="space-y-2 text-xs">
                  {weeks.slice(0, 3).map((week, idx) => (
                    <div key={idx} className="text-cyan-50">
                      <div className="flex items-center gap-2 font-medium mb-1">
                        <span>{week.emoji || '📅'}</span>
                        <span>{week.name}</span>
                        {week.status && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            week.status === 'current' ? 'bg-cyan-500 text-white' :
                            week.status === 'upcoming' ? 'bg-blue-500 text-white' :
                            'bg-gray-600 text-gray-100'
                          }`}>
                            {week.status}
                          </span>
                        )}
                      </div>
                      {week.recipes && week.recipes.length > 0 && (
                        <div className="text-cyan-200 text-xs ml-6">
                          {week.recipes.length} recipe{week.recipes.length !== 1 ? 's' : ''} planned
                        </div>
                      )}
                    </div>
                  ))}
                  {weeks.length > 3 && (
                    <div className="text-cyan-200 italic">
                      ...and {weeks.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Week updated
        if (part.type === 'tool-update_week') {
          const result = part.output as UpdateWeekResult;

          return (
            <div
              key={index}
              className="bg-orange-950/80 border-2 border-orange-500 rounded-lg p-3 text-sm"
            >
              <div className="font-semibold text-orange-100 mb-1">
                ✏️ Week updated
              </div>
              {result?.message && (
                <div className="text-orange-50 text-xs mb-1">
                  {result.message}
                </div>
              )}
              {result?.updates && Object.keys(result.updates).length > 0 && (
                <div className="text-orange-200 text-xs">
                  Updated: {Object.keys(result.updates).filter(k => k !== 'updatedAt').join(', ')}
                </div>
              )}
            </div>
          );
        }

        // Generic tool result (fallback) - only show if it's a tool part
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const toolName = part.type.replace('tool-', '');
          const result = ('output' in part ? part.output : null) as unknown;

          return (
            <div
              key={index}
              className="bg-gray-900/90 border-2 border-gray-600 rounded-lg p-3 text-xs"
            >
              <div className="font-semibold text-gray-100 mb-1">
                🔧 {toolName}
              </div>
              {result ? (
                <pre className="text-gray-50 text-xs overflow-auto mt-1 max-h-32">
                  {JSON.stringify(result, null, 2)}
                </pre>
              ) : null}
            </div>
          );
        }

        return null;
      })}

      {/* Text content - show LAST so it appears after tool results */}
      {textContent && (
        <div className={role === 'user' ? 'whitespace-pre-wrap text-white' : 'prose prose-sm dark:prose-invert max-w-none'}>
          {role === 'assistant' ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {textContent}
            </ReactMarkdown>
          ) : (
            textContent
          )}
        </div>
      )}
    </div>
  );
};