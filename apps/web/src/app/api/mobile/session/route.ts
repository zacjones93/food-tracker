import {
  assertMobileMutationOrigin,
  createMobileSessionDTO,
  MobileAPIError,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { updateKVSessionTeam } from "@/utils/kv-session";
import { z } from "zod";

export async function GET() {
  try {
    const context = await requireMobileSession();
    return Response.json(await createMobileSessionDTO(context), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const context = await requireMobileSession();
    const { teamId } = z.object({ teamId: z.string().min(1) }).parse(await request.json());
    if (!context.memberships.some((membership) => membership.id === teamId)) {
      throw new MobileAPIError(403, "You are not an active member of that team");
    }
    await updateKVSessionTeam(context.session.id, context.session.userId, teamId);
    return Response.json({ success: true, activeTeamId: teamId }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
