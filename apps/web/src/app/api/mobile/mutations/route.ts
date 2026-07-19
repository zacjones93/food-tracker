import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { applyMobileMutations } from "@/lib/mobile-sync";
import { mobileSyncRequestSchema } from "@/lib/mobile-sync-contract";

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const { permissions, teamId, userId } = await requireMobileSession();
    const input = mobileSyncRequestSchema.parse(await request.json());
    const result = await applyMobileMutations({
      mutations: input.mutations,
      permissions,
      teamId,
      userId,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
