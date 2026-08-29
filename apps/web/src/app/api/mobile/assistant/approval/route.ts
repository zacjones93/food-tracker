import {
  handleAssistantRequest,
  handleAssistantStreamRequest,
} from "@/lib/assistant/proxy";
import {
  adaptTanstackStreamForMobile,
  mobileApprovalResponseToAgui,
  trustedMobileApprovalsFromTanstackEvents,
  type MobileApprovalDecision,
} from "@/lib/assistant/mobile-protocol";
import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

interface MobileApprovalBody {
  chatId?: string;
  parentRunId?: string;
  messages?: Array<{
    id: string;
    role: "system" | "user" | "assistant";
    parts: Array<{ type: "text"; text: string }>;
  }>;
  decisions?: MobileApprovalDecision[];
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertMobileMutationOrigin(request);
    const body = await request.json() as MobileApprovalBody;
    if (
      !body.chatId ||
      !body.parentRunId ||
      body.parentRunId.length > 128 ||
      !Array.isArray(body.messages) ||
      !Array.isArray(body.decisions)
    ) {
      return Response.json({ error: "Invalid approval response" }, { status: 422 });
    }

    const parentResponse = await handleAssistantStreamRequest(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        chatId: body.chatId,
        knownRunIds: [],
        closeOnTerminal: true,
        replayRunId: body.parentRunId,
      }),
    }));
    if (parentResponse.status === 204 || !parentResponse.body) {
      return Response.json(
        { error: "Approval request is no longer pending" },
        { status: 409 },
      );
    }
    if (!parentResponse.ok) return parentResponse;
    let trustedApprovals: ReturnType<typeof trustedMobileApprovalsFromTanstackEvents>;
    try {
      trustedApprovals = trustedMobileApprovalsFromTanstackEvents({
        eventStream: await parentResponse.text(),
        parentRunId: body.parentRunId,
      });
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        return Response.json(
          { error: "Approval request is no longer pending" },
          { status: 409 },
        );
      }
      throw error;
    }

    const runId = crypto.randomUUID();
    let assistantBody: ReturnType<typeof mobileApprovalResponseToAgui>;
    try {
      assistantBody = mobileApprovalResponseToAgui({
        chatId: body.chatId,
        runId,
        parentRunId: body.parentRunId,
        messages: body.messages,
        approvals: trustedApprovals,
        decisions: body.decisions,
      });
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        return Response.json({ error: "Invalid approval response" }, { status: 422 });
      }
      throw error;
    }
    const startResponse = await handleAssistantRequest(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(assistantBody),
    }));
    if (!startResponse.ok) return startResponse;

    const assistantResponse = await handleAssistantStreamRequest(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        chatId: body.chatId,
        knownRunIds: [],
        closeOnTerminal: true,
        replayRunId: runId,
      }),
    }));
    if (!assistantResponse.ok || !assistantResponse.body) return assistantResponse;
    return new Response(adaptTanstackStreamForMobile(assistantResponse.body), {
      status: assistantResponse.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "x-request-id": assistantResponse.headers.get("x-request-id") ?? "",
        "x-run-id": assistantResponse.headers.get("x-run-id") ?? runId,
      },
    });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
