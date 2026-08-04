import {
  assistantWorkerErrorResponse,
  parseAssistantRequestContext,
} from "./context";
export { AssistantChatSession } from "./chat-session";

const MAX_BODY_BYTES = 512_000;

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error("Request too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("Request too large");
  }
  return JSON.parse(text);
}

export default {
  async fetch(request, env): Promise<Response> {
    let requestId: string | undefined;
    try {
      const url = new URL(request.url);
      if (request.method !== "POST" || ![
        "/v1/chat",
        "/v1/chat/events",
        "/v1/chat/cancel",
        "/v1/chat/delete",
      ].includes(url.pathname)) {
        return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      }
      const context = parseAssistantRequestContext(request);
      requestId = context.requestId;
      const requestBody = await readBoundedJson(request);
      const session = env.ASSISTANT_CHAT_SESSIONS.getByName(context.chatId);
      const sessionPath = url.pathname === "/v1/chat"
        ? "/runs"
        : url.pathname === "/v1/chat/events"
          ? "/events"
          : url.pathname === "/v1/chat/cancel"
            ? "/cancel"
            : "/delete";
      console.info(JSON.stringify({
        scope: "assistant-worker",
        event: url.pathname === "/v1/chat" ? "run.accepted" : "session.connected",
        requestId: context.requestId,
        runId: context.runId,
      }));
      return await session.fetch(new Request(`https://assistant-session.internal${sessionPath}`, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(requestBody),
      }));
    } catch (error) {
      console.error(JSON.stringify({
        scope: "assistant-worker",
        event: "run.failed",
        requestId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      }));
      return assistantWorkerErrorResponse(error, requestId);
    }
  },
} satisfies ExportedHandler<AssistantWorkerEnv>;
