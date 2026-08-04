import type { AssistantPageContext } from "./assistant-context";

export interface ActiveAssistantMention {
  start: number;
  end: number;
  query: string;
}

export function getActiveAssistantMention({
  value,
  cursor = value.length,
}: {
  value: string;
  cursor?: number;
}): ActiveAssistantMention | null {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const beforeCursor = value.slice(0, safeCursor);
  const start = beforeCursor.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(value[start - 1] ?? "")) return null;

  const query = value.slice(start + 1, safeCursor);
  if (query.includes("@") || query.includes("\n")) return null;

  return { start, end: safeCursor, query };
}

export function insertAssistantMention({
  value,
  mention,
  context,
}: {
  value: string;
  mention: ActiveAssistantMention;
  context: AssistantPageContext;
}) {
  const suffix = value.slice(mention.end);
  const replacement = `@${context.label}${/^\s/.test(suffix) ? "" : " "}`;
  return {
    value: `${value.slice(0, mention.start)}${replacement}${suffix}`,
    cursor: mention.start + replacement.length,
  };
}

export function getAssistantContextIdentity(context: AssistantPageContext) {
  return `${context.kind}:${context.entityId}`;
}
