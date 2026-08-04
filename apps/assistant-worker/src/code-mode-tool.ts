import type { Executor, ToolProvider } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/tanstack-ai";

import { CODE_MODE_DESCRIPTION } from "./code-mode-contract";
import { AssistantWorkerError } from "./context";

export function createAssistantCodeTool({
  executor,
  tools,
}: {
  executor: Executor;
  tools: ToolProvider[];
}) {
  const codeTool = createCodeTool({
    executor,
    tools,
    description: CODE_MODE_DESCRIPTION,
  });
  if (!codeTool.execute) {
    throw new AssistantWorkerError(
      "CODE_MODE_UNAVAILABLE",
      "Assistant retrieval is unavailable",
      503,
    );
  }
  return codeTool;
}
