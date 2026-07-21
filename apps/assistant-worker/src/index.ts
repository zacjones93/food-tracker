import {
  assistantWorkerErrorResponse,
  parseAssistantRequestContext,
} from "./context";
import { runAssistant } from "./assistant";

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
      if (request.method !== "POST" || url.pathname !== "/v1/chat") {
        return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      }
      const context = parseAssistantRequestContext(request);
      requestId = context.requestId;
      const requestBody = await readBoundedJson(request);
      console.info(JSON.stringify({
        scope: "assistant-worker",
        event: "run.started",
        requestId: context.requestId,
        runId: context.runId,
      }));
      return await runAssistant({
        requestBody,
        env,
        context,
        signal: request.signal,
      });
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
