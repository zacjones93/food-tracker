import assert from "node:assert/strict";
import test from "node:test";

import {
  getPendingAssistantToolApprovalIds,
  resolveAssistantToolApproval,
} from "./tool-approval";

test("only exposes resolvable pending tool approvals", () => {
  const approvalIds = getPendingAssistantToolApprovalIds({
    interrupts: [
      { id: "approval-1", kind: "generic", status: "pending", canResolve: true },
      { id: "approval-2", kind: "tool-approval", status: "submitting", canResolve: true },
      { id: "approval-3", kind: "tool-approval", status: "pending", canResolve: false },
      { id: "unbound-1", kind: "unbound", status: "pending", canResolve: false },
    ],
  });

  assert.deepEqual([...approvalIds], ["approval-1"]);
});

test("resolves a server-only tool approval through its generic bound interrupt", () => {
  const decisions: unknown[] = [];
  const didResolve = resolveAssistantToolApproval({
    interrupt: {
      id: "approval-1",
      kind: "generic",
      status: "pending",
      canResolve: true,
      resolveInterrupt: (approved) => decisions.push(approved),
    },
    approved: true,
  });

  assert.equal(didResolve, true);
  assert.deepEqual(decisions, [{ approved: true }]);
});

test("resolves a typed tool approval with its boolean decision", () => {
  const decisions: boolean[] = [];
  const didResolve = resolveAssistantToolApproval({
    interrupt: {
      id: "approval-1",
      kind: "tool-approval",
      status: "pending",
      canResolve: true,
      resolveInterrupt: (approved) => decisions.push(approved),
    },
    approved: false,
  });

  assert.equal(didResolve, true);
  assert.deepEqual(decisions, [false]);
});

test("does not resolve a stale approval", () => {
  let didCallResolver = false;
  const didResolve = resolveAssistantToolApproval({
    interrupt: {
      id: "approval-1",
      kind: "generic",
      status: "submitting",
      canResolve: true,
      resolveInterrupt: () => {
        didCallResolver = true;
      },
    },
    approved: false,
  });

  assert.equal(didResolve, false);
  assert.equal(didCallResolver, false);
});
