import assert from "node:assert/strict";
import test from "node:test";

import {
  mobileApprovalResponseToAgui,
  mobileMessagesToAgui,
  tanstackEventToLegacyDelta,
  trustedMobileApprovalsFromTanstackEvents,
} from "./mobile-protocol";

function trustedApprovalEvent({
  metadataInput = { url: "https://example.com/soup" },
  originalArgs = { url: "https://example.com/soup" },
  toolName = "create_recipe_from_url",
  bindingToolName = "create_recipe_from_url",
}: {
  metadataInput?: Record<string, unknown>;
  originalArgs?: Record<string, unknown>;
  toolName?: string;
  bindingToolName?: string;
} = {}) {
  return `data: ${JSON.stringify({
    type: "RUN_FINISHED",
    threadId: "chat-1",
    runId: "parent-run",
    outcome: {
      type: "interrupt",
      interrupts: [{
        id: "approval_tool-1",
        reason: "tool_call",
        toolCallId: "tool-1",
        metadata: {
          kind: "approval",
          toolName,
          input: metadataInput,
          "tanstack:interruptBinding": {
            v: 1,
            kind: "tool-approval",
            interruptId: "approval_tool-1",
            interruptedRunId: "parent-run",
            generation: 0,
            toolName: bindingToolName,
            toolCallId: "tool-1",
            originalArgs,
            inputSchemaHash: "schema-input",
            approvalSchemaHash: "schema-approval",
            responseSchemaHash: "schema-response",
          },
        },
      }],
    },
  })}\n\ndata: [DONE]\n\n`;
}

test("serializes the legacy mobile assistant request as protocol-neutral AG-UI", () => {
  const body = mobileMessagesToAgui({
    chatId: "chat-1",
    runId: "run-1",
    messages: [{
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Find soup" }],
    }],
    pageContext: {
      kind: "recipe",
      entityId: "recipe-1",
      label: "Tomato soup",
      href: "/recipes/recipe-1",
    },
    mentionedContexts: [{
      kind: "week",
      entityId: "week-1",
      label: "July 20–26",
      href: "/schedule/week-1",
    }],
  });
  assert.equal(body.threadId, "chat-1");
  assert.equal(body.runId, "run-1");
  assert.deepEqual(body.messages[0]?.parts, [{ type: "text", content: "Find soup" }]);
  assert.deepEqual(body.forwardedProps, {
    chatId: "chat-1",
    pageContext: {
      kind: "recipe",
      entityId: "recipe-1",
      label: "Tomato soup",
      href: "/recipes/recipe-1",
    },
    mentionedContexts: [{
      kind: "week",
      entityId: "week-1",
      label: "July 20–26",
      href: "/schedule/week-1",
    }],
  });
});

test("maps TanStack text events to the stable mobile text-delta contract", () => {
  assert.equal(
    tanstackEventToLegacyDelta('data: {"type":"TEXT_MESSAGE_CONTENT","delta":"hello"}'),
    'data: {"type":"text-delta","delta":"hello"}\n\n',
  );
  assert.equal(tanstackEventToLegacyDelta('data: {"type":"RUN_FINISHED"}'), "data: [DONE]\n\n");
  assert.equal(
    tanstackEventToLegacyDelta(
      'data: {"type":"RUN_STARTED","threadId":"chat-1","runId":"run-1"}',
    ),
    'data: {"type":"start","runId":"run-1"}\n\n',
  );
  assert.equal(
    tanstackEventToLegacyDelta(
      'data: {"type":"TOOL_CALL_START","toolCallId":"tool-1","toolCallName":"execute_typescript"}',
    ),
    'data: {"type":"tool-input-start","toolCallId":"tool-1","toolName":"execute_typescript"}\n\n',
  );
});

test("bridges approval interrupts without approving them", () => {
  const converted = tanstackEventToLegacyDelta(`data: ${JSON.stringify({
    type: "RUN_FINISHED",
    threadId: "chat-1",
    runId: "parent-run",
    outcome: {
      type: "interrupt",
      interrupts: [{
        id: "approval_tool-1",
        reason: "tool_call",
        message: "Approval required to run create_recipe_from_url",
        toolCallId: "tool-1",
        metadata: {
          kind: "approval",
          toolName: "create_recipe_from_url",
          input: { url: "https://example.com/soup" },
        },
      }],
    },
  })}`);

  assert.ok(converted);
  const firstLine = converted.split("\n")[0];
  const event = JSON.parse(firstLine!.slice("data: ".length)) as {
    type: string;
    parentRunId: string;
    approvals: Array<Record<string, unknown>>;
  };
  assert.equal(event.type, "approval-required");
  assert.equal(event.parentRunId, "parent-run");
  assert.deepEqual(event.approvals, [{
    id: "approval_tool-1",
    toolCallId: "tool-1",
    toolName: "create_recipe_from_url",
    arguments: '{"url":"https://example.com/soup"}',
    message: "Approval required to run create_recipe_from_url",
  }]);
  assert.equal("approved" in event.approvals[0]!, false);
  assert.match(converted, /data: \[DONE\]/u);
});

test("builds an exact child-run resume batch for explicit mobile decisions", () => {
  const approvals = trustedMobileApprovalsFromTanstackEvents({
    eventStream: trustedApprovalEvent(),
    parentRunId: "parent-run",
  });
  const body = mobileApprovalResponseToAgui({
    chatId: "chat-1",
    runId: "child-run",
    parentRunId: "parent-run",
    messages: [{
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Import this recipe" }],
    }],
    approvals,
    decisions: [{
      approvalId: "approval_tool-1",
      toolCallId: "tool-1",
      approved: false,
    }],
  });

  assert.equal(body.parentRunId, "parent-run");
  assert.deepEqual(body.resume, [{
    interruptId: "approval_tool-1",
    status: "resolved",
    payload: { approved: false },
  }]);
  const approvalMessage = body.messages.at(-1);
  assert.ok(approvalMessage && "toolCalls" in approvalMessage);
  assert.deepEqual(approvalMessage.toolCalls, [{
    id: "tool-1",
    type: "function",
    function: {
      name: "create_recipe_from_url",
      arguments: '{"url":"https://example.com/soup"}',
    },
  }]);
});

test("uses only the persisted interrupt binding for approval tool metadata", () => {
  const approvals = trustedMobileApprovalsFromTanstackEvents({
    eventStream: trustedApprovalEvent(),
    parentRunId: "parent-run",
  });

  assert.deepEqual(approvals, [{
    approvalId: "approval_tool-1",
    toolCallId: "tool-1",
    toolName: "create_recipe_from_url",
    arguments: '{"url":"https://example.com/soup"}',
  }]);
});

test("rejects altered persisted approval names or arguments", () => {
  assert.throws(() => trustedMobileApprovalsFromTanstackEvents({
    eventStream: trustedApprovalEvent({ bindingToolName: "apply_team_changes" }),
    parentRunId: "parent-run",
  }), /invalid/u);
  assert.throws(() => trustedMobileApprovalsFromTanstackEvents({
    eventStream: trustedApprovalEvent({
      metadataInput: { url: "https://attacker.example/changed" },
    }),
    parentRunId: "parent-run",
  }), /invalid/u);
});

test("rejects incomplete, extra, or mismatched client decisions", () => {
  const approvals = trustedMobileApprovalsFromTanstackEvents({
    eventStream: trustedApprovalEvent(),
    parentRunId: "parent-run",
  });
  const base = {
    chatId: "chat-1",
    runId: "child-run",
    parentRunId: "parent-run",
    messages: [],
    approvals,
  };

  assert.throws(() => mobileApprovalResponseToAgui({
    ...base,
    decisions: [],
  }), /required/u);
  assert.throws(() => mobileApprovalResponseToAgui({
    ...base,
    decisions: [
      { approvalId: "approval_tool-1", toolCallId: "tool-1", approved: true },
      { approvalId: "approval_tool-2", toolCallId: "tool-2", approved: false },
    ],
  }), /required/u);
  assert.throws(() => mobileApprovalResponseToAgui({
    ...base,
    decisions: [{
      approvalId: "approval_tool-1",
      toolCallId: "tool-tampered",
      approved: true,
    }],
  }), /match/u);
  assert.throws(() => mobileApprovalResponseToAgui({
    ...base,
    decisions: [{
      approvalId: "approval_tool-1",
      toolCallId: "tool-1",
      approved: true,
      toolName: "apply_team_changes",
      arguments: '{"changes":[{"tampered":true}]}',
    } as never],
  }), /cannot include tool metadata/u);
});
