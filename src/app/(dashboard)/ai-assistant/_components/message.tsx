import type { MyUIMessage } from "@/app/api/chat/route";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThinkingBlock } from "./thinking-block";
import { parseThinkingBlocks } from "@/lib/parse-thinking";
import {
  GetRecipePart,
  SearchRecipesPart,
  AddRecipePart,
  UpdateRecipePart,
  SearchWeeksPart,
  UpdateWeekPart,
  GetUserTimePart,
  AddRecipeToSchedulePart,
  GenericToolPart,
  type GetRecipeResult,
  type SearchRecipesResult,
  type AddRecipeResult,
  type UpdateRecipeResult,
  type SearchWeeksResult,
  type UpdateWeekResult,
  type GetUserTimeResult,
  type AddRecipeToScheduleResult,
} from "./message-part-types";

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
          return <GetRecipePart key={index} result={part.output as GetRecipeResult | undefined} />;
        }

        // Recipe search results
        if (part.type === 'tool-search_recipes') {
          return <SearchRecipesPart key={index} result={part.output as SearchRecipesResult | undefined} />;
        }

        // Recipe added
        if (part.type === 'tool-add_recipe') {
          return <AddRecipePart key={index} result={part.output as AddRecipeResult | undefined} />;
        }

        // Recipe updated
        if (part.type === 'tool-update_recipe_metadata') {
          return <UpdateRecipePart key={index} result={part.output as UpdateRecipeResult | undefined} />;
        }

        // Week search results
        if (part.type === 'tool-search_weeks') {
          return <SearchWeeksPart key={index} result={part.output as SearchWeeksResult | undefined} />;
        }

        // Week updated
        if (part.type === 'tool-update_week') {
          return <UpdateWeekPart key={index} result={part.output as UpdateWeekResult | undefined} />;
        }

        // User time
        if (part.type === 'tool-get_user_time') {
          return <GetUserTimePart key={index} result={part.output as GetUserTimeResult | undefined} />;
        }

        // Add recipe to schedule
        if (part.type === 'tool-add_recipe_to_schedule') {
          return <AddRecipeToSchedulePart key={index} result={part.output as AddRecipeToScheduleResult | undefined} />;
        }

        // Generic tool result (fallback) - only show if it's a tool part
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          const toolName = part.type.replace('tool-', '');
          const result = ('output' in part ? part.output : null) as unknown;
          return <GenericToolPart key={index} toolName={toolName} result={result} />;
        }

        return null;
      })}

      {/* Text content - show LAST so it appears after tool results */}
      {textContent && (
        <div className="space-y-3">
          {role === 'assistant' ? (
            // Parse and render thinking blocks for assistant messages
            parseThinkingBlocks(textContent).map((segment, index) => {
              if (segment.type === 'thinking') {
                return <ThinkingBlock key={index} content={segment.content} />;
              }
              return (
                <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {segment.content}
                  </ReactMarkdown>
                </div>
              );
            })
          ) : (
            // User messages render as-is
            <div className="whitespace-pre-wrap text-white">{textContent}</div>
          )}
        </div>
      )}
    </div>
  );
};