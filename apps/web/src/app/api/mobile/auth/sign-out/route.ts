import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";
import {
  deleteSessionTokenCookie,
  getSessionFromCookie,
  invalidateSession,
} from "@/utils/auth";

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const session = await getSessionFromCookie();
    if (session) await invalidateSession(session.id, session.userId);
    await deleteSessionTokenCookie();
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
