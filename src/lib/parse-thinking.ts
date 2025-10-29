/**
 * Parses text content to extract <thinking> blocks
 * Returns an array of content segments with their types
 */
export interface ContentSegment {
  type: 'text' | 'thinking';
  content: string;
}

export function parseThinkingBlocks(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = thinkingRegex.exec(text)) !== null) {
    // Add text before the thinking block
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index).trim();
      if (textBefore) {
        segments.push({
          type: 'text',
          content: textBefore,
        });
      }
    }

    // Add the thinking block
    const thinkingContent = match[1].trim();
    if (thinkingContent) {
      segments.push({
        type: 'thinking',
        content: thinkingContent,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last thinking block
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex).trim();
    if (remainingText) {
      segments.push({
        type: 'text',
        content: remainingText,
      });
    }
  }

  return segments;
}
