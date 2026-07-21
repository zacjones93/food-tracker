export const WORKER_ASSISTANT_ERROR_MESSAGES = {
  CODE_MODE_EXECUTION_FAILED:
    "I couldn't safely complete that recipe lookup. Please retry.",
  CODE_MODE_NO_ANSWER:
    "I couldn't safely complete that recipe lookup. Please retry.",
  TOOL_FAILURE_PARTIAL:
    "Some recipe data could not be retrieved, so this answer may be incomplete.",
  EMPTY_RESPONSE:
    "The assistant did not return an answer. Please retry.",
  MODEL_ERROR:
    "The assistant is temporarily unavailable. Please retry.",
} as const;

export type WorkerAssistantErrorCode = keyof typeof WORKER_ASSISTANT_ERROR_MESSAGES;

export function getWorkerAssistantErrorMessage(code: WorkerAssistantErrorCode): string {
  return WORKER_ASSISTANT_ERROR_MESSAGES[code];
}
