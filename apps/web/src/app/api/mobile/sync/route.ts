import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { applyMobileMutations } from "@/lib/mobile-sync";
import { mobileSyncRequestSchema } from "@/lib/mobile-sync-contract";
import { getMobileWorkspace } from "@/lib/mobile-workspace";

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
    const workspace = await getMobileWorkspace({ permissions, teamId });

    return Response.json(
      {
        acknowledgedIds: result.acknowledged.map((item) => item.mutationId),
        acknowledged: result.acknowledged,
        conflicts: result.conflicts,
        cursor: workspace.cursor,
        workspace,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
