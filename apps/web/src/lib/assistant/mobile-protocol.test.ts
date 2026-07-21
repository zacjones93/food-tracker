import assert from "node:assert/strict";
import test from "node:test";

import { mobileMessagesToAgui, tanstackEventToLegacyDelta } from "./mobile-protocol";

test("serializes the legacy mobile assistant request as protocol-neutral AG-UI", () => {
  const body = mobileMessagesToAgui({
    chatId: "chat-1",
    runId: "run-1",
    messages: [{
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Find soup" }],
    }],
  });
  assert.equal(body.threadId, "chat-1");
  assert.equal(body.runId, "run-1");
  assert.deepEqual(body.messages[0]?.parts, [{ type: "text", content: "Find soup" }]);
  assert.deepEqual(body.forwardedProps, { chatId: "chat-1" });
});

test("maps TanStack text events to the stable mobile text-delta contract", () => {
  assert.equal(
    tanstackEventToLegacyDelta('data: {"type":"TEXT_MESSAGE_CONTENT","delta":"hello"}'),
    'data: {"type":"text-delta","delta":"hello"}\n\n',
  );
  assert.equal(tanstackEventToLegacyDelta('data: {"type":"RUN_FINISHED"}'), "data: [DONE]\n\n");
  assert.equal(tanstackEventToLegacyDelta('data: {"type":"TOOL_CALL_START"}'), null);
});
