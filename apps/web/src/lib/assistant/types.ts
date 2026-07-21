import type { UIMessage } from "@tanstack/ai-react";

export type AssistantMessage = UIMessage;

export interface AssistantErrorPayload {
  error: string;
  code: string;
  requestId?: string;
  runId?: string;
}
