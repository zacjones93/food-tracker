"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsibleContentProps {
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}

export function CollapsibleContent({
  children,
  maxHeight = "6rem",
  className = ""
}: CollapsibleContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const maxHeightPx = parseFloat(maxHeight) * 16; // Convert rem to px (assuming 16px base)
      const scrollHeight = contentRef.current.scrollHeight;
      setHasOverflow(scrollHeight > maxHeightPx);
    }
  }, [maxHeight, children]);

  return (
    <div className={className}>
      <div
        ref={contentRef}
        className="relative"
        style={!isExpanded && hasOverflow ? {
          maxHeight,
          overflow: 'hidden',
        } : {}}
      >
        {children}
        {!isExpanded && hasOverflow && (
          <div
            className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
            style={{
              background: 'linear-gradient(to top, rgb(30 27 75 / 0.95), transparent)'
            }}
          />
        )}
      </div>
      {hasOverflow && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-200 hover:text-indigo-50 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}
