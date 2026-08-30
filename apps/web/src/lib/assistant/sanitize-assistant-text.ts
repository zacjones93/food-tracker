const SERIALIZED_CODE_TOOL_CALL =
  /\{\s*"name"\s*:\s*"(?:codemode_execute|execute_typescript)"\s*,\s*"(?:parameters|arguments|input)"\s*:\s*\{\s*"(?:code|typescriptCode)"\s*:\s*"(?:\\.|[^"\\])*"\s*\}\s*\}/giu;
const FENCED_CODE_BLOCK =
  /```(?:javascript|js|typescript|ts)?[^\n]*\n[\s\S]*?```/giu;
const XML_TOOL_CALL = /<tool_call>[\s\S]*?<\/tool_call>/giu;
const PROCESS_LABEL = /^\s*assistant\s*$/gimu;

function truncateAtInternalCode(text: string): string {
  const markers = [
    /\{\s*"name"\s*:\s*"(?:codemode_execute|execute_typescript)"/iu,
    /```(?:javascript|js|typescript|ts)?/iu,
    /<tool_call>/iu,
    /async\s*\(\s*\)\s*=>/iu,
    /\btypescriptCode\b\s*:/iu,
  ];
  const indexes = markers
    .map((marker) => text.search(marker))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return text;
  return text.slice(0, Math.min(...indexes));
}

export function sanitizeAssistantText(text: string): string {
  const withoutCompleteBlocks = text
    .replace(SERIALIZED_CODE_TOOL_CALL, "")
    .replace(FENCED_CODE_BLOCK, "")
    .replace(XML_TOOL_CALL, "")
    .replace(PROCESS_LABEL, "");
  return truncateAtInternalCode(withoutCompleteBlocks)
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

const assistantTextSanitizer = { sanitizeAssistantText };

export default assistantTextSanitizer;
