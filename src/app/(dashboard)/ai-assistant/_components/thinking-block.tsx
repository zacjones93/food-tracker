"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-purple-500/30 bg-purple-950/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-900/20 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-purple-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-purple-400" />
        )}
        <Brain className="h-4 w-4 text-purple-700 dark:text-purple-400" />
        <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
          Thinking process
        </span>
        <span className="ml-auto text-xs text-purple-400/60">
          {isExpanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 py-3 border-t border-purple-500/20">
          <div className="text-sm italic text-purple-700 dark:text-purple-400 whitespace-pre-wrap">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
