import { handleAssistantCancelRequest } from "@/lib/assistant/proxy";
import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    assertMobileMutationOrigin(request);
    const body = await request.json() as { chatId?: string; runId?: string };
    if (!body.chatId || !body.runId) {
      return Response.json({ error: "Invalid assistant request" }, { status: 422 });
    }
    return await handleAssistantCancelRequest(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
    }));
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
