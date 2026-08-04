import { handleAssistantStreamRequest } from "@/lib/assistant/proxy";
import { adaptTanstackStreamForMobile } from "@/lib/assistant/mobile-protocol";
import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertMobileMutationOrigin(request);
    const body = await request.json() as { chatId?: string };
    if (!body.chatId) {
      return Response.json({ error: "Invalid assistant request" }, { status: 422 });
    }
    const response = await handleAssistantStreamRequest(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        chatId: body.chatId,
        knownRunIds: [],
        closeOnTerminal: true,
      }),
    }));
    if (response.status === 204 || !response.body) return response;
    if (!response.ok) return response;
    return new Response(adaptTanstackStreamForMobile(response.body), {
      status: response.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
