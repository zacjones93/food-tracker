import { handleAssistantCancelRequest } from "@/lib/assistant/proxy";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleAssistantCancelRequest(request);
}
