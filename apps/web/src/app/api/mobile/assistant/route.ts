import { handleAssistantRequest } from "@/lib/assistant/proxy";
import {
  adaptTanstackStreamForMobile,
  mobileMessagesToAgui,
} from "@/lib/assistant/mobile-protocol";
import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const body = await request.json() as {
      chatId?: string;
      messages?: Array<{
        id: string;
        role: "system" | "user" | "assistant";
        parts: Array<{ type: "text"; text: string }>;
      }>;
    };
    if (!body.chatId || !Array.isArray(body.messages)) {
      return Response.json({ error: "Invalid assistant request" }, { status: 422 });
    }
    const runId = crypto.randomUUID();
    const assistantResponse = await handleAssistantRequest(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(mobileMessagesToAgui({
        chatId: body.chatId,
        runId,
        messages: body.messages,
      })),
      signal: request.signal,
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
