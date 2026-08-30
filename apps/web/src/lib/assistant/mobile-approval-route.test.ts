import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = readFile(
  new URL("../../app/api/mobile/assistant/approval/route.ts", import.meta.url),
  "utf8",
);
const proxySource = readFile(new URL("./proxy.ts", import.meta.url), "utf8");

test("the mobile approval route enforces origin before processing the request", async () => {
  const source = await routeSource;
  assert.match(source, /assertMobileMutationOrigin\(request\)/u);
  assert.ok(
    source.indexOf("assertMobileMutationOrigin(request)") < source.indexOf("request.json()"),
  );
});

test("the mobile approval route replays the scoped parent before starting a child", async () => {
  const source = await routeSource;
  assert.match(source, /replayRunId: body\.parentRunId/u);
  assert.match(source, /trustedMobileApprovalsFromTanstackEvents/u);
  assert.match(source, /readResponseTextWithDeadline/u);
  assert.match(source, /response\.body\?\.cancel/u);
  assert.ok(
    source.indexOf("replayRunId: body.parentRunId") <
      source.lastIndexOf("mobileApprovalResponseToAgui({"),
  );
  assert.doesNotMatch(source, /body\.(toolName|arguments)/u);
});

test("parent replay remains scoped to the authenticated chat owner and active team", async () => {
  const [route, proxy] = await Promise.all([routeSource, proxySource]);
  assert.match(route, /handleAssistantStreamRequest/u);
  assert.match(proxy, /requireAiAccess\(\)/u);
  assert.match(proxy, /isChatOwnedBy\(\{ chat, userId: session\.user\.id, teamId \}\)/u);
});
