import {
  DynamicWorkerExecutor,
  createCodeTool,
  createWorkersAiChat,
  tanstackTools,
} from "@food-tracker/ai-v2-platform-runtime";

import {
  type ReadOnlyToolNamespace,
  validateReadOnlyToolNamespaces,
} from "./read-only-tools";

const DEFAULT_CODE_EXECUTION_TIMEOUT_MS = 10_000;
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

export interface AssistantPlatformBindings {
  ai: Ai;
  loader: WorkerLoader;
}

export interface CreateAssistantPlatformOptions {
  readOnlyToolNamespaces: ReadOnlyToolNamespace[];
  model?: string;
  aiGatewayId?: string;
  codeExecutionTimeoutMs?: number;
}

export interface CreateAssistantPlatformFromBindingsOptions
  extends CreateAssistantPlatformOptions {
  bindings: AssistantPlatformBindings;
}

export function createAssistantPlatformFromBindings({
  bindings,
  readOnlyToolNamespaces,
  model = DEFAULT_WORKERS_AI_MODEL,
  aiGatewayId,
  codeExecutionTimeoutMs = DEFAULT_CODE_EXECUTION_TIMEOUT_MS,
}: CreateAssistantPlatformFromBindingsOptions) {
  validateReadOnlyToolNamespaces({ namespaces: readOnlyToolNamespaces });

  if (!Number.isSafeInteger(codeExecutionTimeoutMs) || codeExecutionTimeoutMs <= 0) {
    throw new Error("Code Mode execution timeout must be a positive integer");
  }

  const modelAdapter = createWorkersAiChat(model, {
    binding: bindings.ai,
    ...(aiGatewayId ? { gateway: aiGatewayId } : {}),
  });
  const executor = new DynamicWorkerExecutor({
    loader: bindings.loader,
    globalOutbound: null,
    timeout: codeExecutionTimeoutMs,
  });
  const codeModeTool = createCodeTool({
    tools: readOnlyToolNamespaces.map(({ name, tools }) => tanstackTools(tools, name)),
    executor,
  });

  return {
    modelAdapter,
    tools: [codeModeTool],
  };
}
