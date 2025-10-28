import "server-only";
import type { AiMessage, AiMessagePart } from "@/db/schema";
import type { MyUIMessage } from "@/app/api/chat/route";

// Extract the parts type from MyUIMessage
type MyUIMessagePart = MyUIMessage['parts'][number];

// Database representation of UI message part
type MyDBUIMessagePart = Omit<AiMessagePart, "id" | "createdAt" | "updatedAt" | "updateCounter">;
type MyDBUIMessagePartSelect = AiMessagePart;

/**
 * Remove JSON metadata objects from text content
 * Properly parses JSON objects that have a "type" field and removes them
 */
function cleanMetadataFromText(text: string): string {
  if (!text || !text.includes('{')) {
    return text.trim();
  }

  let result = '';
  let i = 0;

  while (i < text.length) {
    // If we find an opening brace, try to parse JSON
    if (text[i] === '{') {
      // Find matching closing brace
      let depth = 0;
      let end = -1;

      for (let j = i; j < text.length; j++) {
        if (text[j] === '{') depth++;
        if (text[j] === '}') {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }

      if (end !== -1) {
        const jsonStr = text.substring(i, end + 1);

        try {
          const parsed = JSON.parse(jsonStr);

          // If it has a "type" field, it's metadata - skip it
          if (parsed && typeof parsed === 'object' && 'type' in parsed) {
            i = end + 1;
            continue;
          }
        } catch {
          // Not valid JSON, keep the character
        }
      }
    }

    // Keep this character
    result += text[i];
    i++;
  }

  return result.trim();
}

/**
 * Convert UIMessage to database rows (flattening parts into separate rows)
 * Each part becomes a row in ai_message_parts with appropriate prefix columns populated
 */
export function uiMessageToDbRows(message: MyUIMessage): {
  messageRow: Omit<AiMessage, "createdAt" | "updatedAt" | "updateCounter">;
  partRows: MyDBUIMessagePart[];
} {
  console.log("🔍 uiMessageToDbRows - Input message:", {
    id: message.id,
    role: message.role,
    partsCount: message.parts?.length || 0,
    parts: message.parts?.map(p => {
      const part = p as { type: string; text?: string; state?: string; toolCallId?: string; output?: unknown; input?: unknown };
      return {
        type: part.type,
        text: part.type === 'text' ? part.text?.substring(0, 100) : undefined,
        state: part.state,
        toolCallId: part.toolCallId,
        hasOutput: part.output !== undefined,
        hasInput: part.input !== undefined,
      };
    }),
  });

  // Log full part structure for debugging
  if (message.parts && message.parts.length > 0) {
    console.log("🔍 First part full structure:", JSON.stringify(message.parts[0], null, 2).substring(0, 500));
  }

  const messageRow = {
    id: message.id,
    chatId: "", // Will be set by caller
    role: message.role,
  };

  // Handle messages without parts (shouldn't happen with UIMessage, but be safe)
  if (!message.parts || message.parts.length === 0) {
    console.log("⚠️ Message has no parts:", message.id);
    return { messageRow, partRows: [] };
  }

  const partRows: MyDBUIMessagePart[] = message.parts
    .filter((part) => {
      // Filter out AI SDK metadata parts that shouldn't be persisted
      const partType = part.type as string;

      // Skip step-start, step-finish, and other internal SDK markers
      if (partType === 'step-start' || partType === 'step-finish' || partType === 'step') {
        console.log(`🔍 Filtering out metadata part: ${partType}`);
        return false;
      }

      return true;
    })
    .map((part, index): MyDBUIMessagePart => {
      const baseRow: MyDBUIMessagePart = {
        messageId: message.id,
        partOrder: index,
        // Initialize all prefix columns as null1
        text_content: null,
        tool_name: null,
        tool_call_id: null,
        tool_args: null,
        tool_result: null,
        tool_state: null,
        image_url: null,
        image_mime_type: null,
        file_url: null,
        file_name: null,
        file_type: null,
        file_metadata: null,
      };

      // Populate appropriate columns based on part type
      // AI SDK v5 uses "tool-${TOOL_NAME}" as the type (e.g., "tool-searchRecipes")
      // and a "state" property to indicate input vs output
      const partType = part.type;

      // Check if this is a text part
      if (partType === "text") {
        let textContent = part.text;

        // Remove AI SDK metadata JSON objects from text
        // These can be simple {"type":"step-start"} or complex nested objects
        textContent = cleanMetadataFromText(textContent);

        return { ...baseRow, text_content: textContent };
      }

      // Check if this is a tool part (starts with "tool-")
      if (partType.startsWith("tool-")) {
      const toolName = partType.substring(5); // Remove "tool-" prefix

      // Use type assertion since we know this is a tool part after checking the type
      const toolPart = part as Extract<MyUIMessagePart, { state?: string }>;

      console.log("✅ Detected tool part:", {
        type: partType,
        toolName,
        state: 'state' in toolPart ? toolPart.state : undefined,
        toolCallId: 'toolCallId' in toolPart ? toolPart.toolCallId : undefined,
      });

      // Check if this part has the expected tool properties
      if ('state' in toolPart && 'toolCallId' in toolPart && 'input' in toolPart) {
        // Tool input (call)
        if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
          return {
            ...baseRow,
            tool_name: toolName,
            tool_call_id: toolPart.toolCallId,
            tool_args: JSON.stringify(toolPart.input),
            tool_state: toolPart.state,
          };
        }

        // Tool output (result)
        if (toolPart.state === "output-available" && 'output' in toolPart) {
          return {
            ...baseRow,
            tool_name: toolName,
            tool_call_id: toolPart.toolCallId,
            tool_args: JSON.stringify(toolPart.input), // Keep input for context
            tool_result: JSON.stringify(toolPart.output),
            tool_state: toolPart.state,
          };
        }

        // Tool error
        if (toolPart.state === "output-error" && 'error' in toolPart) {
          return {
            ...baseRow,
            tool_name: toolName,
            tool_call_id: toolPart.toolCallId,
            tool_args: JSON.stringify(toolPart.input),
            tool_result: JSON.stringify({ error: toolPart.error }),
            tool_state: toolPart.state,
          };
        }
      }
    }

    // Handle other known types with proper type narrowing
    // Since we've exhausted text and tool- types, fall back to storing as text
    console.log("⚠️ Unknown part type, storing as text:", {
      part,
      type: part.type,
    });
    return {
      ...baseRow,
      text_content: JSON.stringify(part),
    };
  });

  console.log("📊 Converted to DB rows:", {
    messageId: messageRow.id,
    role: messageRow.role,
    partRowsCount: partRows.length,
    toolCallCount: partRows.filter(p => p.tool_name).length,
  });

  return { messageRow, partRows };
}

/**
 * Convert database rows back to UIMessage
 * Groups parts by messageId and reconstructs the parts array in correct order
 */
export function dbRowsToUIMessage(
  messageRow: AiMessage,
  partRows: MyDBUIMessagePartSelect[]
): MyUIMessage {
  // Sort parts by order
  const sortedParts = [...partRows].sort((a, b) => a.partOrder - b.partOrder);

  // Reconstruct parts array
  const parts: MyUIMessagePart[] = sortedParts.map((row): MyUIMessagePart => {
    // Text part
    if (row.text_content) {
      // Clean metadata markers from stored text (in case they were saved)
      const cleanText = cleanMetadataFromText(row.text_content);

      return {
        type: "text",
        text: cleanText,
      };
    }

    // Tool part (AI SDK v5 format: "tool-${TOOL_NAME}")
    if (row.tool_name && row.tool_call_id) {
      const toolType = `tool-${row.tool_name}`;

      // Tool with input only (call in progress or ready to execute)
      if (row.tool_state === "input-streaming" || row.tool_state === "input-available") {
        return {
          type: toolType,
          toolCallId: row.tool_call_id,
          input: row.tool_args ? JSON.parse(row.tool_args) : {},
          state: row.tool_state,
        } as MyUIMessagePart;
      }

      // Tool with output (result available)
      if (row.tool_state === "output-available" && row.tool_result) {
        return {
          type: toolType,
          toolCallId: row.tool_call_id,
          input: row.tool_args ? JSON.parse(row.tool_args) : {},
          output: JSON.parse(row.tool_result),
          state: row.tool_state,
        } as MyUIMessagePart;
      }

      // Tool with error
      if (row.tool_state === "output-error" && row.tool_result) {
        const errorData = JSON.parse(row.tool_result);
        return {
          type: toolType,
          toolCallId: row.tool_call_id,
          input: row.tool_args ? JSON.parse(row.tool_args) : {},
          error: errorData.error || "Unknown error",
          state: row.tool_state,
        } as MyUIMessagePart;
      }
    }

    // Fallback for unknown part types
    return {
      type: "text",
      text: "",
    };
  });

  // Map role to MyUIMessage role type
  // AI SDK v5 UIMessage doesn't have "tool" role, only user/assistant/system
  let role: MyUIMessage['role'];
  if (messageRow.role === 'tool') {
    // Map tool messages to assistant role (they represent tool outputs)
    role = 'assistant';
  } else {
    role = messageRow.role as MyUIMessage['role'];
  }

  return {
    id: messageRow.id,
    role,
    parts,
  };
}
