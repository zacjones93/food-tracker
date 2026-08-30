interface LegacyMobileMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
}

export interface MobileApprovalDecision {
  approvalId: string;
  toolCallId: string;
  approved: boolean;
}

export interface TrustedMobileApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  arguments: string;
}

function mobileMessagesToWire(messages: LegacyMobileMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.parts.map((part) => part.text).join(""),
    parts: message.parts.map((part) => ({ type: "text", content: part.text })),
  }));
}

export function mobileMessagesToAgui({
  chatId,
  runId,
  messages,
  pageContext,
  mentionedContexts,
}: {
  chatId: string;
  runId: string;
  messages: LegacyMobileMessage[];
  pageContext?: unknown;
  mentionedContexts?: unknown;
}) {
  return {
    threadId: chatId,
    runId,
    state: {},
    messages: mobileMessagesToWire(messages),
    tools: [],
    context: [],
    forwardedProps: {
      chatId,
      ...(pageContext === undefined ? {} : { pageContext }),
      ...(mentionedContexts === undefined ? {} : { mentionedContexts }),
    },
  };
}

function requiredMobileApprovalIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new TypeError(`${field} is required`);
  }
  return normalized;
}

export function mobileApprovalResponseToAgui({
  chatId,
  runId,
  parentRunId,
  messages,
  approvals,
  decisions,
}: {
  chatId: string;
  runId: string;
  parentRunId: string;
  messages: LegacyMobileMessage[];
  approvals: TrustedMobileApproval[];
  decisions: MobileApprovalDecision[];
}) {
  if (
    decisions.length === 0 ||
    decisions.length > 12 ||
    approvals.length !== decisions.length
  ) {
    throw new TypeError("At least one approval decision is required");
  }

  const trustedByApprovalId = new Map(
    approvals.map((approval) => [approval.approvalId, approval]),
  );
  const trustedToolCallIds = new Set(approvals.map((approval) => approval.toolCallId));
  if (
    trustedByApprovalId.size !== approvals.length ||
    trustedToolCallIds.size !== approvals.length
  ) {
    throw new TypeError("Trusted approvals must be unique");
  }
  const seenApprovalIds = new Set<string>();
  const seenToolCallIds = new Set<string>();
  const normalizedDecisions = decisions.map((decision) => {
    const decisionRecord = recordValue(decision);
    if (
      !decisionRecord ||
      Object.keys(decisionRecord).some((key) =>
        key !== "approvalId" && key !== "toolCallId" && key !== "approved")
    ) {
      throw new TypeError("Approval decisions cannot include tool metadata");
    }
    const approvalId = requiredMobileApprovalIdentifier(
      decisionRecord.approvalId as string,
      "approvalId",
    );
    const toolCallId = requiredMobileApprovalIdentifier(
      decisionRecord.toolCallId as string,
      "toolCallId",
    );
    if (typeof decisionRecord.approved !== "boolean") {
      throw new TypeError("Approval decision must be explicit");
    }
    if (approvalId !== `approval_${toolCallId}`) {
      throw new TypeError("Approval does not match its tool call");
    }
    if (seenApprovalIds.has(approvalId) || seenToolCallIds.has(toolCallId)) {
      throw new TypeError("Approval decisions must be unique");
    }
    seenApprovalIds.add(approvalId);
    seenToolCallIds.add(toolCallId);
    const trusted = trustedByApprovalId.get(approvalId);
    if (!trusted || trusted.toolCallId !== toolCallId) {
      throw new TypeError("Approval does not match the pending server interrupt");
    }
    return {
      approved: decisionRecord.approved,
      toolName: trusted.toolName,
      arguments: trusted.arguments,
      approvalId,
      toolCallId,
    };
  });
  const toolParts = normalizedDecisions.map((decision) => ({
    type: "tool-call" as const,
    id: decision.toolCallId,
    name: decision.toolName,
    arguments: decision.arguments,
    state: "approval-responded" as const,
    approval: {
      id: decision.approvalId,
      needsApproval: true as const,
      approved: decision.approved,
    },
  }));

  return {
    threadId: chatId,
    runId,
    parentRunId,
    state: {},
    messages: [
      ...mobileMessagesToWire(messages),
      {
        id: `${parentRunId}-approval-response`,
        role: "assistant" as const,
        parts: toolParts,
        toolCalls: normalizedDecisions.map((decision) => ({
          id: decision.toolCallId,
          type: "function" as const,
          function: {
            name: decision.toolName,
            arguments: decision.arguments,
          },
        })),
      },
    ],
    tools: [],
    context: [],
    forwardedProps: { chatId },
    resume: normalizedDecisions.map((decision) => ({
      interruptId: decision.approvalId,
      status: "resolved" as const,
      payload: { approved: decision.approved },
    })),
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trustedApprovalFromInterrupt({
  value,
  parentRunId,
}: {
  value: unknown;
  parentRunId: string;
}): TrustedMobileApproval {
  const interrupt = recordValue(value);
  const metadata = recordValue(interrupt?.metadata);
  const binding = recordValue(metadata?.["tanstack:interruptBinding"]);
  if (
    !interrupt ||
    !metadata ||
    !binding ||
    metadata.kind !== "approval" ||
    binding.kind !== "tool-approval" ||
    typeof interrupt.id !== "string" ||
    typeof interrupt.toolCallId !== "string" ||
    typeof metadata.toolName !== "string" ||
    binding.interruptId !== interrupt.id ||
    binding.toolCallId !== interrupt.toolCallId ||
    binding.toolName !== metadata.toolName ||
    binding.interruptedRunId !== parentRunId ||
    binding.v !== 1 ||
    typeof binding.generation !== "number" ||
    !Number.isInteger(binding.generation) ||
    binding.generation < 0 ||
    typeof binding.inputSchemaHash !== "string" ||
    typeof binding.approvalSchemaHash !== "string" ||
    typeof binding.responseSchemaHash !== "string" ||
    interrupt.id !== `approval_${interrupt.toolCallId}`
  ) {
    throw new TypeError("Stored approval interrupt is invalid");
  }
  const originalArgs = binding.originalArgs;
  if (
    !originalArgs ||
    typeof originalArgs !== "object" ||
    Array.isArray(originalArgs) ||
    JSON.stringify(metadata.input) !== JSON.stringify(originalArgs)
  ) {
    throw new TypeError("Stored approval arguments are invalid");
  }
  const argumentsJson = JSON.stringify(originalArgs);
  if (!argumentsJson || argumentsJson.length > 100_000) {
    throw new TypeError("Stored approval arguments are too large");
  }
  return {
    approvalId: requiredMobileApprovalIdentifier(interrupt.id, "approvalId"),
    toolCallId: requiredMobileApprovalIdentifier(interrupt.toolCallId, "toolCallId"),
    toolName: requiredMobileApprovalIdentifier(metadata.toolName, "toolName"),
    arguments: argumentsJson,
  };
}

export function trustedMobileApprovalsFromTanstackEvents({
  eventStream,
  parentRunId,
}: {
  eventStream: string;
  parentRunId: string;
}): TrustedMobileApproval[] {
  const expectedRunId = requiredMobileApprovalIdentifier(parentRunId, "parentRunId");
  let terminal: Record<string, unknown> | null = null;
  for (const line of eventStream.split(/\r?\n/u)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try {
      const event = recordValue(JSON.parse(line.slice(6)));
      if (event?.type === "RUN_FINISHED" && event.runId === expectedRunId) {
        terminal = event;
      }
    } catch {
      // Ignore non-JSON keepalive or incomplete transport lines.
    }
  }
  const outcome = recordValue(terminal?.outcome);
  if (outcome?.type !== "interrupt" || !Array.isArray(outcome.interrupts)) {
    throw new TypeError("Approval request is no longer pending");
  }
  if (outcome.interrupts.length === 0 || outcome.interrupts.length > 12) {
    throw new TypeError("Stored approval batch is invalid");
  }
  return outcome.interrupts.map((value) =>
    trustedApprovalFromInterrupt({ value, parentRunId: expectedRunId }));
}

function approvalDelta(event: Record<string, unknown>): string | null {
  const outcome = event.outcome;
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) return null;
  const outcomeRecord = outcome as Record<string, unknown>;
  if (outcomeRecord.type !== "interrupt" || !Array.isArray(outcomeRecord.interrupts)) {
    return null;
  }
  const parentRunId = typeof event.runId === "string" ? event.runId : "";
  if (!parentRunId) return null;
  const approvals = outcomeRecord.interrupts.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const interrupt = value as Record<string, unknown>;
    const metadata = interrupt.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const metadataRecord = metadata as Record<string, unknown>;
    if (metadataRecord.kind !== "approval") return [];
    if (
      typeof interrupt.id !== "string" ||
      typeof interrupt.toolCallId !== "string" ||
      typeof metadataRecord.toolName !== "string"
    ) return [];
    return [{
      id: interrupt.id,
      toolCallId: interrupt.toolCallId,
      toolName: metadataRecord.toolName,
      arguments: JSON.stringify(metadataRecord.input ?? {}) ?? "{}",
      message: typeof interrupt.message === "string" ? interrupt.message : undefined,
    }];
  });
  if (approvals.length === 0) return null;
  return `data: ${JSON.stringify({
    type: "approval-required",
    parentRunId,
    approvals,
  })}\n\n`;
}

export function tanstackEventToLegacyDelta(line: string): string | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6);
  if (payload === "[DONE]") return "data: [DONE]\n\n";
  try {
    const event = JSON.parse(payload) as Record<string, unknown>;
    if (event.type === "TEXT_MESSAGE_CONTENT" && typeof event.delta === "string") {
      return `data: ${JSON.stringify({ type: "text-delta", delta: event.delta })}\n\n`;
    }
    if (event.type === "RUN_STARTED" && typeof event.runId === "string") {
      return `data: ${JSON.stringify({ type: "start", runId: event.runId })}\n\n`;
    }
    if (event.type === "TOOL_CALL_START") {
      return `data: ${JSON.stringify({
        type: "tool-input-start",
        toolCallId: event.toolCallId,
        toolName: event.toolCallName ?? event.toolName,
      })}\n\n`;
    }
    if (event.type === "TOOL_CALL_END" || event.type === "TOOL_CALL_RESULT") {
      return `data: ${JSON.stringify({
        type: "tool-output-available",
        toolCallId: event.toolCallId,
      })}\n\n`;
    }
    if (event.type === "RUN_ERROR") {
      return `data: ${JSON.stringify({
        type: "error",
        message: event.message,
      })}\n\n`;
    }
    if (event.type === "RUN_FINISHED") {
      return `${approvalDelta(event) ?? ""}data: [DONE]\n\n`;
    }
  } catch {
    return null;
  }
  return null;
}

export function adaptTanstackStreamForMobile(stream: ReadableStream<Uint8Array>): ReadableStream {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const converted = tanstackEventToLegacyDelta(line.trimEnd());
        if (converted) controller.enqueue(encoder.encode(converted));
      }
    },
    flush(controller) {
      const converted = tanstackEventToLegacyDelta(buffer.trimEnd());
      if (converted) controller.enqueue(encoder.encode(converted));
    },
  }));
}
