import { handleAssistantStreamRequest } from "@/lib/assistant/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleAssistantStreamRequest(request);
}
