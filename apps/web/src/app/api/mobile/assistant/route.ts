import { POST as postChat } from "@/app/api/chat/route";
import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    return postChat(request);
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
